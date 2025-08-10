use crate::error::{AppResult, AppError, ErrorCode};
use image::{DynamicImage, ImageFormat, ImageBuffer, Luma};
use imageproc::contrast::adaptive_threshold;
use imageproc::morphology::{close, open};
use imageproc::filter::gaussian_blur_f32;
use imageproc::distance_transform::Norm;
use leptess::{LepTess, Variable};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OCRResult {
    pub text: String,
    pub confidence: f32,
    pub engine_used: String,
    pub processing_time: f64,
    pub word_details: Vec<WordDetail>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WordDetail {
    pub text: String,
    pub confidence: f32,
    pub bbox: BoundingBox,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoundingBox {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreprocessingOptions {
    pub enhance_contrast: bool,
    pub denoise: bool,
    pub threshold_method: String,
    pub apply_morphology: bool,
}

impl Default for PreprocessingOptions {
    fn default() -> Self {
        Self {
            enhance_contrast: true,
            denoise: true,
            threshold_method: "adaptive_gaussian".to_string(),
            apply_morphology: true,
        }
    }
}

pub struct OCRService {
    tesseract: LepTess,
    // Cache for preprocessed images to avoid reprocessing
    image_cache: Arc<dashmap::DashMap<String, Arc<DynamicImage>>>,
}

impl OCRService {
    pub fn new() -> AppResult<Self> {
        log::info!("Initializing OCR Service with Tesseract");

        let mut tesseract = LepTess::new(None, "eng")
            .map_err(|e| AppError::with_details(
                ErrorCode::OcrInitialization,
                "Failed to initialize Tesseract",
                e.to_string()
            ))?;

        // Configure Tesseract for better accuracy
        tesseract.set_variable(Variable::TesseditPagesegMode, "6")
            .map_err(|e| AppError::with_details(
                ErrorCode::OcrInitialization,
                "Failed to set page segmentation mode",
                e.to_string()
            ))?;
        tesseract.set_variable(Variable::TesseditOcrEngineMode, "3")
            .map_err(|e| AppError::with_details(
                ErrorCode::OcrInitialization,
                "Failed to set OCR engine mode",
                e.to_string()
            ))?;

        log::info!("OCR Service initialized successfully");
        Ok(Self {
            tesseract,
            image_cache: Arc::new(dashmap::DashMap::new()),
        })
    }

    pub async fn extract_text_from_image(
        &mut self,
        image_path: &str,
        options: Option<PreprocessingOptions>,
    ) -> AppResult<OCRResult> {
        let start_time = std::time::Instant::now();

        log::info!("Processing OCR for file: {}", image_path);

        // Check cache first for performance optimization
        let _cache_key = format!("{}_{:?}", image_path, options);

        // Load and preprocess the image (with caching)
        let image = self.load_and_preprocess_image_cached(image_path, options.as_ref())?;

        // Convert to bytes for Tesseract (reuse buffer to reduce allocations)
        let image_bytes = self.image_to_bytes_optimized(&image)?;

        // Set image data in Tesseract
        self.tesseract.set_image_from_mem(&image_bytes)
            .map_err(|e| AppError::with_details(
                ErrorCode::OcrProcessing,
                "Failed to set image in Tesseract",
                e.to_string()
            ))?;

        // Extract text
        let text = self.tesseract.get_utf8_text()
            .map_err(|e| AppError::with_details(
                ErrorCode::OcrProcessing,
                "Failed to extract text",
                e.to_string()
            ))?;

        // Get confidence
        let confidence = self.tesseract.mean_text_conf() as f32 / 100.0;

        // Get word details
        let word_details = self.extract_word_details()?;

        let processing_time = start_time.elapsed().as_secs_f64();

        log::info!("OCR processing completed in {:.2}s with confidence {:.2}",
                  processing_time, confidence);

        Ok(OCRResult {
            text,
            confidence,
            engine_used: "Tesseract".to_string(),
            processing_time,
            word_details,
        })
    }

    fn load_and_preprocess_image_cached(
        &self,
        image_path: &str,
        options: Option<&PreprocessingOptions>,
    ) -> AppResult<Arc<DynamicImage>> {
        let cache_key = format!("{}_{:?}", image_path, options);

        // Check cache first
        if let Some(cached_image) = self.image_cache.get(&cache_key) {
            return Ok(cached_image.clone());
        }

        // Load the image
        let image = image::open(image_path)
            .map_err(|e| AppError::with_details(
                ErrorCode::ImageLoading,
                "Failed to load image",
                e.to_string()
            ))?;

        // Apply preprocessing if options are provided
        let processed_image = if let Some(opts) = options {
            self.preprocess_image(image, opts)?
        } else {
            image
        };

        let arc_image = Arc::new(processed_image);

        // Cache the processed image (limit cache size)
        if self.image_cache.len() < 10 {
            self.image_cache.insert(cache_key, arc_image.clone());
        }

        Ok(arc_image)
    }

    fn load_and_preprocess_image(
        &self,
        image_path: &str,
        options: Option<&PreprocessingOptions>,
    ) -> AppResult<DynamicImage> {
        // Load the image
        let image = image::open(image_path)
            .map_err(|e| AppError::with_details(
                ErrorCode::ImageLoading,
                "Failed to load image",
                e.to_string()
            ))?;

        // Apply preprocessing if options are provided
        if let Some(opts) = options {
            self.preprocess_image(image, opts)
        } else {
            Ok(image)
        }
    }

    fn preprocess_image(
        &self,
        image: DynamicImage,
        options: &PreprocessingOptions,
    ) -> AppResult<DynamicImage> {
        // Convert to grayscale for processing
        let mut gray_image = image.to_luma8();

        // Apply denoising
        if options.denoise {
            gray_image = ImageBuffer::from_fn(gray_image.width(), gray_image.height(), |x, y| {
                let blurred = gaussian_blur_f32(&gray_image, 1.0);
                *blurred.get_pixel(x, y)
            });
        }

        // Apply contrast enhancement
        if options.enhance_contrast {
            gray_image = self.enhance_contrast(&gray_image);
        }

        // Apply thresholding
        if options.threshold_method == "adaptive_gaussian" {
            gray_image = adaptive_threshold(&gray_image, 11);
        }

        // Apply morphological operations
        if options.apply_morphology {
            gray_image = self.apply_morphology(&gray_image);
        }

        Ok(DynamicImage::ImageLuma8(gray_image))
    }

    fn enhance_contrast(&self, image: &ImageBuffer<Luma<u8>, Vec<u8>>) -> ImageBuffer<Luma<u8>, Vec<u8>> {
        // Simple contrast enhancement using histogram stretching
        let mut min_val = 255u8;
        let mut max_val = 0u8;

        // Find min and max values
        for pixel in image.pixels() {
            let val = pixel[0];
            min_val = min_val.min(val);
            max_val = max_val.max(val);
        }

        // Stretch histogram
        let range = max_val - min_val;
        if range == 0 {
            return image.clone();
        }

        ImageBuffer::from_fn(image.width(), image.height(), |x, y| {
            let old_val = image.get_pixel(x, y)[0];
            let new_val = ((old_val - min_val) as f32 / range as f32 * 255.0) as u8;
            Luma([new_val])
        })
    }

    fn apply_morphology(&self, image: &ImageBuffer<Luma<u8>, Vec<u8>>) -> ImageBuffer<Luma<u8>, Vec<u8>> {
        // Apply opening followed by closing to remove noise and fill gaps
        let kernel = Norm::L1;
        let opened = open(image, kernel, 1);
        close(&opened, kernel, 1)
    }

    fn image_to_bytes_optimized(&self, image: &DynamicImage) -> AppResult<Vec<u8>> {
        // Pre-allocate buffer with estimated size to reduce reallocations
        let estimated_size = (image.width() * image.height() * 4) as usize; // RGBA estimate
        let mut bytes = Vec::with_capacity(estimated_size);

        image.write_to(&mut std::io::Cursor::new(&mut bytes), ImageFormat::Png)
            .map_err(|e| AppError::with_details(
                ErrorCode::ImagePreprocessing,
                "Failed to convert image to bytes",
                e.to_string()
            ))?;
        Ok(bytes)
    }

    fn image_to_bytes(&self, image: &DynamicImage) -> AppResult<Vec<u8>> {
        let mut bytes = Vec::new();
        image.write_to(&mut std::io::Cursor::new(&mut bytes), ImageFormat::Png)
            .map_err(|e| AppError::with_details(
                ErrorCode::ImagePreprocessing,
                "Failed to convert image to bytes",
                e.to_string()
            ))?;
        Ok(bytes)
    }

    fn extract_word_details(&mut self) -> AppResult<Vec<WordDetail>> {
        let mut word_details = Vec::new();

        // For now, create a simple word detail extraction
        // In a more sophisticated implementation, we would use Tesseract's word-level API
        if let Ok(full_text) = self.tesseract.get_utf8_text() {
            let words: Vec<&str> = full_text.split_whitespace().collect();
            let confidence = self.tesseract.mean_text_conf() as f32 / 100.0;

            // Create mock bounding boxes for words
            // In a real implementation, we would get actual bounding boxes from Tesseract
            for (i, word) in words.iter().enumerate() {
                let x = (i as i32) * 50; // Mock positioning
                word_details.push(WordDetail {
                    text: word.to_string(),
                    confidence,
                    bbox: BoundingBox {
                        x,
                        y: 10,
                        width: (word.len() as i32) * 8, // Approximate width
                        height: 20,
                    },
                });
            }
        }

        Ok(word_details)
    }
}
