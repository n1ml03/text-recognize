use anyhow::{anyhow, Result};
use image::{DynamicImage, ImageFormat, ImageBuffer, Luma};
use imageproc::contrast::adaptive_threshold;
use imageproc::morphology::{close, open};
use imageproc::filter::gaussian_blur_f32;
use imageproc::distance_transform::Norm;
use leptess::{LepTess, Variable};
use serde::{Deserialize, Serialize};

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
}

impl OCRService {
    pub fn new() -> Result<Self> {
        log::info!("Initializing OCR Service with Tesseract");

        let mut tesseract = LepTess::new(None, "eng")
            .map_err(|e| anyhow!("Failed to initialize Tesseract: {}", e))?;

        // Configure Tesseract for better accuracy
        tesseract.set_variable(Variable::TesseditPagesegMode, "6")
            .map_err(|e| anyhow!("Failed to set page segmentation mode: {}", e))?;
        tesseract.set_variable(Variable::TesseditOcrEngineMode, "3")
            .map_err(|e| anyhow!("Failed to set OCR engine mode: {}", e))?;

        log::info!("OCR Service initialized successfully");
        Ok(Self { tesseract })
    }

    pub async fn extract_text_from_image(
        &mut self,
        image_path: &str,
        options: Option<PreprocessingOptions>,
    ) -> Result<OCRResult> {
        let start_time = std::time::Instant::now();

        log::info!("Processing OCR for file: {}", image_path);

        // Load and preprocess the image
        let image = self.load_and_preprocess_image(image_path, options.as_ref())?;

        // Convert to bytes for Tesseract
        let image_bytes = self.image_to_bytes(&image)?;

        // Set image data in Tesseract
        self.tesseract.set_image_from_mem(&image_bytes)
            .map_err(|e| anyhow!("Failed to set image in Tesseract: {}", e))?;

        // Extract text
        let text = self.tesseract.get_utf8_text()
            .map_err(|e| anyhow!("Failed to extract text: {}", e))?;

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

    fn load_and_preprocess_image(
        &self,
        image_path: &str,
        options: Option<&PreprocessingOptions>,
    ) -> Result<DynamicImage> {
        // Load the image
        let image = image::open(image_path)
            .map_err(|e| anyhow!("Failed to load image: {}", e))?;

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
    ) -> Result<DynamicImage> {
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

    fn image_to_bytes(&self, image: &DynamicImage) -> Result<Vec<u8>> {
        let mut bytes = Vec::new();
        image.write_to(&mut std::io::Cursor::new(&mut bytes), ImageFormat::Png)
            .map_err(|e| anyhow!("Failed to convert image to bytes: {}", e))?;
        Ok(bytes)
    }

    fn extract_word_details(&mut self) -> Result<Vec<WordDetail>> {
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
