use crate::error::{AppResult, AppError, ErrorCode};
use crate::utils::file_extensions::SupportedExtensions;
use crate::utils::file_validation;

use crate::utils::path_utils;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub extension: String,
    pub file_type: FileType,
    pub last_modified: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FileType {
    Image,
    Video,
    Document,
    Pdf,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentExtractionResult {
    pub text: String,
    pub file_path: String,
    pub file_type: String,
    pub processing_time: f64,
    pub success: bool,
    pub error_message: Option<String>,
    pub metadata: std::collections::HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoFrameExtractionResult {
    pub frame_paths: Vec<String>,
    pub output_directory: String,
    pub total_frames_extracted: i32,
    pub total_video_frames: i32,
    pub processing_time: f64,
    pub success: bool,
    pub error_message: Option<String>,
    pub metadata: std::collections::HashMap<String, serde_json::Value>,
}

pub struct FileHandlerService {
    http_client: reqwest::Client,
    python_service_url: String,
}

impl FileHandlerService {
    pub fn new() -> AppResult<Self> {
        let http_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(60)) // 1 minute timeout for document processing
            .build()
            .map_err(|e| AppError::with_details(
                ErrorCode::InternalError,
                "Failed to create HTTP client for document processing",
                e.to_string()
            ))?;

        // Use environment variable for backend URL, fallback to localhost
        let backend_url = std::env::var("BACKEND_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:8000".to_string());

        Ok(Self {
            http_client,
            python_service_url: backend_url,
        })
    }

    fn get_default_instance() -> Self {
        Self::new().unwrap_or_else(|_| {
            // Fallback with basic client
            let backend_url = std::env::var("BACKEND_URL")
                .unwrap_or_else(|_| "http://127.0.0.1:8000".to_string());

            Self {
                http_client: reqwest::Client::new(),
                python_service_url: backend_url,
            }
        })
    }

    pub fn get_file_info(file_path: &str) -> AppResult<FileInfo> {
        let metadata = file_validation::get_file_metadata(file_path)?;
        let path = Path::new(file_path);

        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Unknown")
            .to_string();

        let extension = path
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase();

        let file_type = Self::determine_file_type(&extension);

        let last_modified = metadata
            .modified()
            .map(|time| {
                let datetime: chrono::DateTime<chrono::Utc> = time.into();
                datetime.format("%Y-%m-%d %H:%M:%S UTC").to_string()
            })
            .unwrap_or_else(|_| "Unknown".to_string());

        Ok(FileInfo {
            path: file_path.to_string(),
            name,
            size: metadata.len(),
            extension,
            file_type,
            last_modified,
        })
    }

    pub fn validate_file_path(file_path: &str) -> AppResult<()> {
        file_validation::validate_file_path(file_path)
    }

    fn determine_file_type(extension: &str) -> FileType {
        if SupportedExtensions::IMAGE_EXTENSIONS.contains(&extension) {
            FileType::Image
        } else if SupportedExtensions::VIDEO_EXTENSIONS.contains(&extension) {
            FileType::Video
        } else if SupportedExtensions::DOCUMENT_EXTENSIONS.contains(&extension) {
            FileType::Document
        } else if SupportedExtensions::PDF_EXTENSIONS.contains(&extension) {
            FileType::Pdf
        } else {
            FileType::Unknown
        }
    }

    pub async fn extract_frames_from_video(
        video_path: &str,
        output_dir: &str,
        frame_interval: Option<u32>,
    ) -> AppResult<Vec<String>> {
        path_utils::ensure_directory_exists(output_dir)?;

        let service = Self::get_default_instance();
        let result = service.call_python_video_frame_service(video_path, output_dir, frame_interval).await?;

        if result.success {
            log::info!("Successfully extracted {} frames from video", result.frame_paths.len());
            Ok(result.frame_paths)
        } else {
            Err(AppError::new(
                ErrorCode::InternalError,
                result.error_message.unwrap_or_else(|| "Video frame extraction failed".to_string())
            ))
        }
    }

    pub fn extract_frames_from_video_sync(
        video_path: &str,
        output_dir: &str,
        frame_interval: Option<u32>,
    ) -> AppResult<Vec<String>> {
        // Synchronous wrapper for the async function
        let rt = tokio::runtime::Runtime::new().map_err(|e| AppError::with_details(
            ErrorCode::InternalError,
            "Failed to create async runtime",
            e.to_string()
        ))?;

        rt.block_on(Self::extract_frames_from_video(video_path, output_dir, frame_interval))
    }







    pub async fn extract_text_from_document(file_path: &str) -> AppResult<String> {
        let service = Self::get_default_instance();
        let result = service.call_python_document_service(file_path).await?;

        if result.success {
            Ok(result.text)
        } else {
            Err(AppError::new(
                ErrorCode::InternalError,
                result.error_message.unwrap_or_else(|| "Document text extraction failed".to_string())
            ))
        }
    }

    async fn call_python_document_service(&self, file_path: &str) -> AppResult<DocumentExtractionResult> {
        // Prepare request data
        let request_data = serde_json::json!({
            "file_path": file_path
        });

        // Make request to Python service
        let response = self.http_client
            .post(&format!("{}/extract/document", self.python_service_url))
            .json(&request_data)
            .send()
            .await
            .map_err(|e| AppError::with_details(
                ErrorCode::InternalError,
                "Failed to communicate with Python document service",
                e.to_string()
            ))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(AppError::with_details(
                ErrorCode::InternalError,
                "Python document service returned error",
                error_text
            ));
        }

        // Parse response
        let result: DocumentExtractionResult = response.json().await
            .map_err(|e| AppError::with_details(
                ErrorCode::InternalError,
                "Failed to parse document extraction response",
                e.to_string()
            ))?;

        Ok(result)
    }

    async fn call_python_video_frame_service(
        &self,
        video_path: &str,
        output_dir: &str,
        frame_interval: Option<u32>
    ) -> AppResult<VideoFrameExtractionResult> {
        // Prepare request data
        let request_data = serde_json::json!({
            "file_path": video_path,
            "options": {
                "frame_interval": frame_interval.unwrap_or(30),
                "output_dir": output_dir,
                "max_frames": 1000,
                "similarity_threshold": 0.85,
                "enable_similarity_detection": true,
                "resize_max_width": 1920,
                "resize_max_height": 1080,
                "jpeg_quality": 85,
                "batch_size": 10
            }
        });

        // Make request to Python service
        let response = self.http_client
            .post(&format!("{}/extract/video-frames", self.python_service_url))
            .json(&request_data)
            .send()
            .await
            .map_err(|e| AppError::with_details(
                ErrorCode::InternalError,
                "Failed to communicate with Python video frame service",
                e.to_string()
            ))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(AppError::with_details(
                ErrorCode::InternalError,
                "Python video frame service returned error",
                error_text
            ));
        }

        // Parse response
        let result: VideoFrameExtractionResult = response.json().await
            .map_err(|e| AppError::with_details(
                ErrorCode::InternalError,
                "Failed to parse video frame extraction response",
                e.to_string()
            ))?;

        Ok(result)
    }

    pub fn cleanup_temp_files(temp_dir: &str) -> AppResult<()> {
        let path = Path::new(temp_dir);

        if path.exists() && path.is_dir() {
            fs::remove_dir_all(path).map_err(|e| {
                AppError::with_details(
                    ErrorCode::FileAccess,
                    "Failed to cleanup temp directory",
                    format!("{}: {}", temp_dir, e)
                )
            })?;
        }

        Ok(())
    }
}
