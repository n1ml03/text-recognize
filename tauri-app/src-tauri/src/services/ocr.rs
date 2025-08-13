use crate::error::{AppResult, AppError, ErrorCode};
use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::path::Path;
use std::sync::Arc;
use tokio::process::{Command as TokioCommand, Child};
use tokio::sync::Mutex;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchOCRRequest {
    pub files: Vec<String>,
    pub preprocessing_options: Option<PreprocessingOptions>,
    pub max_file_size_mb: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchOCRResult {
    pub results: Vec<OCRResult>,
    pub total_processing_time: f64,
    pub batch_size: usize,
    pub compression_ratio: Option<f64>,
    pub files_processed: usize,
    pub files_failed: usize,
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
    python_service_url: String,
    http_client: reqwest::Client,
    process_handle: Arc<Mutex<Option<Child>>>,
}

impl OCRService {
    pub fn new() -> AppResult<Self> {
        log::info!("Initializing OCR Service with PaddleOCR backend");

        let http_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(300)) // 5 minute timeout for large files
            .http2_prior_knowledge() // Enable HTTP/2
            .http2_keep_alive_interval(Some(std::time::Duration::from_secs(30)))
            .http2_keep_alive_timeout(std::time::Duration::from_secs(10))
            .http2_keep_alive_while_idle(true)
            .pool_idle_timeout(Some(std::time::Duration::from_secs(90)))
            .pool_max_idle_per_host(10)
            .gzip(true) // Enable automatic gzip decompression
            .brotli(true) // Enable automatic brotli decompression
            .deflate(true) // Enable automatic deflate decompression
            .build()
            .map_err(|e| AppError::with_details(
                ErrorCode::OcrInitialization,
                "Failed to create HTTP client",
                e.to_string()
            ))?;

        log::info!("OCR Service initialized successfully");

        // Use environment variable for backend URL, fallback to localhost
        let backend_url = std::env::var("BACKEND_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:8000".to_string());

        Ok(Self {
            python_service_url: backend_url,
            http_client,
            process_handle: Arc::new(Mutex::new(None)),
        })
    }

    async fn ensure_python_service_running(&self) -> AppResult<()> {
        // Check if Python service is running (do not auto-start)
        match self.http_client.get(&format!("{}/health", self.python_service_url)).send().await {
            Ok(response) if response.status().is_success() => {
                log::info!("Python OCR service is running");
                Ok(())
            }
            _ => {
                Err(AppError::with_details(
                    ErrorCode::OcrInitialization,
                    "Python OCR service not available",
                    format!("Please start the Python backend service manually:\n1. Navigate to the python_backend directory\n2. Run: python main.py --host 0.0.0.0 --port 8000\n3. Ensure service is accessible at {}/health", self.python_service_url)
                ))
            }
        }
    }



    pub async fn extract_text_from_image(
        &mut self,
        image_path: &str,
        options: Option<PreprocessingOptions>,
    ) -> AppResult<OCRResult> {
        log::info!("Processing OCR for file: {}", image_path);

        // Ensure Python service is running
        self.ensure_python_service_running().await?;

        // Validate file exists
        if !Path::new(image_path).exists() {
            return Err(AppError::with_details(
                ErrorCode::ImageLoading,
                "Image file not found",
                image_path.to_string()
            ));
        }

        // Create multipart form with file path (more efficient than uploading entire file)
        let opts = options.unwrap_or_default();
        let mut form = reqwest::multipart::Form::new()
            .text("file_path", image_path.to_string())
            .text("enhance_contrast", opts.enhance_contrast.to_string())
            .text("denoise", opts.denoise.to_string())
            .text("threshold_method", opts.threshold_method.clone())
            .text("apply_morphology", opts.apply_morphology.to_string())
            .text("deskew", "true")
            .text("upscale", "true");

        // Make request to Python service using multipart form
        let response = self.http_client
            .post(&format!("{}/ocr/image", self.python_service_url))
            .multipart(form)
            .send()
            .await
            .map_err(|e| AppError::with_details(
                ErrorCode::OcrProcessing,
                "Failed to communicate with Python OCR service",
                e.to_string()
            ))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(AppError::with_details(
                ErrorCode::OcrProcessing,
                "Python OCR service returned error",
                error_text
            ));
        }

        // Parse response
        let ocr_result: OCRResult = response.json().await
            .map_err(|e| AppError::with_details(
                ErrorCode::OcrProcessing,
                "Failed to parse OCR response",
                e.to_string()
            ))?;

        log::info!("OCR processing completed in {:.2}s with confidence {:.2}",
                  ocr_result.processing_time, ocr_result.confidence);

        Ok(ocr_result)
    }

    pub async fn extract_text_from_video(
        &mut self,
        video_path: &str,
        options: Option<PreprocessingOptions>,
    ) -> AppResult<OCRResult> {
        log::info!("Processing video OCR for file: {}", video_path);

        // Ensure Python service is running
        self.ensure_python_service_running().await?;

        // Validate file exists
        if !Path::new(video_path).exists() {
            return Err(AppError::with_details(
                ErrorCode::ImageLoading,
                "Video file not found",
                video_path.to_string()
            ));
        }

        // Create multipart form with file path (more efficient than uploading entire file)
        let opts = options.unwrap_or_default();
        let mut form = reqwest::multipart::Form::new()
            .text("file_path", video_path.to_string())
            .text("frame_interval", "5")
            .text("similarity_threshold", "0.98")
            .text("min_confidence", "0.6")
            .text("max_frames", "1000")
            .text("enhance_contrast", opts.enhance_contrast.to_string())
            .text("denoise", opts.denoise.to_string())
            .text("threshold_method", opts.threshold_method.clone())
            .text("apply_morphology", opts.apply_morphology.to_string())
            .text("deskew", "true")
            .text("upscale", "true");

        // Make request to Python service
        let response = self.http_client
            .post(&format!("{}/ocr/video", self.python_service_url))
            .multipart(form)
            .send()
            .await
            .map_err(|e| AppError::with_details(
                ErrorCode::OcrProcessing,
                "Failed to communicate with Python OCR service",
                e.to_string()
            ))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(AppError::with_details(
                ErrorCode::OcrProcessing,
                "Python OCR service returned error",
                error_text
            ));
        }

        // Parse response - expecting VideoOCRResult from backend
        let video_result: serde_json::Value = response.json().await
            .map_err(|e| AppError::with_details(
                ErrorCode::OcrProcessing,
                "Failed to parse video OCR response",
                e.to_string()
            ))?;

        // Convert to OCRResult format
        let ocr_result = OCRResult {
            text: video_result["text"].as_str().unwrap_or("").to_string(),
            confidence: video_result["confidence"].as_f64().unwrap_or(0.0) as f32,
            engine_used: "PaddleOCR".to_string(),
            processing_time: video_result["processing_time"].as_f64().unwrap_or(0.0),
            word_details: vec![], // Video processing doesn't provide word details
        };

        log::info!("Video OCR processing completed in {:.2}s with confidence {:.2}",
                  ocr_result.processing_time, ocr_result.confidence);

        Ok(ocr_result)
    }

    pub async fn extract_text_from_images_batch(
        &mut self,
        file_paths: Vec<String>,
        options: Option<PreprocessingOptions>,
        max_file_size_mb: i32,
    ) -> AppResult<BatchOCRResult> {
        log::info!("Processing batch OCR for {} files", file_paths.len());

        // Ensure Python service is running
        self.ensure_python_service_running().await?;

        // Prepare batch request
        let batch_request = BatchOCRRequest {
            files: file_paths.clone(),
            preprocessing_options: options,
            max_file_size_mb,
        };

        // Make request to Python service
        let response = self.http_client
            .post(&format!("{}/ocr/batch", self.python_service_url))
            .json(&batch_request)
            .send()
            .await
            .map_err(|e| AppError::with_details(
                ErrorCode::OcrProcessing,
                "Failed to communicate with Python OCR service for batch processing",
                e.to_string()
            ))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(AppError::with_details(
                ErrorCode::OcrProcessing,
                "Python OCR service returned error for batch processing",
                error_text
            ));
        }

        // Parse response
        let batch_result: BatchOCRResult = response.json().await
            .map_err(|e| AppError::with_details(
                ErrorCode::OcrProcessing,
                "Failed to parse batch OCR response",
                e.to_string()
            ))?;

        log::info!("Batch OCR processing completed: {} files processed, {} failed in {:.2}s",
                  batch_result.files_processed, batch_result.files_failed, batch_result.total_processing_time);

        Ok(batch_result)
    }

    pub async fn shutdown(&self) -> AppResult<()> {
        log::info!("Shutting down OCR service...");

        let mut process_guard = self.process_handle.lock().await;
        if let Some(mut child) = process_guard.take() {
            log::info!("Terminating PaddleOCR process...");

            // Try to terminate gracefully first
            match child.kill().await {
                Ok(_) => {
                    log::info!("PaddleOCR process terminated successfully");
                }
                Err(e) => {
                    log::warn!("Failed to terminate PaddleOCR process: {}", e);
                }
            }

            // Wait for the process to exit
            match child.wait().await {
                Ok(status) => {
                    log::info!("PaddleOCR process exited with status: {}", status);
                }
                Err(e) => {
                    log::warn!("Error waiting for PaddleOCR process to exit: {}", e);
                }
            }
        }

        Ok(())
    }
}

impl Drop for OCRService {
    fn drop(&mut self) {
        // Note: We can't use async in Drop, so we'll just log
        // The actual cleanup should be done via the shutdown method
        log::info!("OCRService dropped - ensure shutdown() was called for proper cleanup");
    }
}
