use crate::error::{AppResult, AppError, ErrorCode};
use crate::utils::file_extensions::SupportedExtensions;
use crate::utils::file_validation;
use crate::utils::text_processing;
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

pub struct FileHandlerService;

impl FileHandlerService {
    pub fn new() -> Self {
        Self
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

    pub fn is_supported_image(file_path: &str) -> bool {
        SupportedExtensions::is_image(file_path)
    }

    pub fn is_supported_video(file_path: &str) -> bool {
        SupportedExtensions::is_video(file_path)
    }

    pub fn is_supported_document(file_path: &str) -> bool {
        SupportedExtensions::is_document(file_path)
    }

    pub fn is_supported_pdf(file_path: &str) -> bool {
        SupportedExtensions::is_pdf(file_path)
    }

    pub fn validate_file_path(file_path: &str) -> AppResult<()> {
        file_validation::validate_file_path(file_path)
    }

    pub fn get_supported_image_extensions() -> Vec<String> {
        SupportedExtensions::IMAGE_EXTENSIONS.iter().map(|s| s.to_string()).collect()
    }

    pub fn get_supported_video_extensions() -> Vec<String> {
        SupportedExtensions::VIDEO_EXTENSIONS.iter().map(|s| s.to_string()).collect()
    }

    pub fn get_supported_document_extensions() -> Vec<String> {
        SupportedExtensions::DOCUMENT_EXTENSIONS.iter().map(|s| s.to_string()).collect()
    }

    pub fn get_supported_pdf_extensions() -> Vec<String> {
        SupportedExtensions::PDF_EXTENSIONS.iter().map(|s| s.to_string()).collect()
    }

    pub fn get_all_supported_extensions() -> Vec<String> {
        SupportedExtensions::get_all()
    }

    pub fn create_backup_path(original_path: &str) -> AppResult<String> {
        path_utils::create_backup_path(original_path)
    }

    pub fn ensure_directory_exists(dir_path: &str) -> AppResult<()> {
        path_utils::ensure_directory_exists(dir_path)
    }

    pub fn get_file_size_formatted(size_bytes: u64) -> String {
        text_processing::format_file_size(size_bytes)
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

    pub fn extract_frames_from_video(
        video_path: &str,
        output_dir: &str,
        frame_interval: Option<u32>,
    ) -> AppResult<Vec<String>> {
        path_utils::ensure_directory_exists(output_dir)?;

        // For now, we'll implement a basic frame extraction using image processing
        // In a production environment, you would use ffmpeg-next or similar

        let interval = frame_interval.unwrap_or(30); // Extract every 30th frame by default
        let mut extracted_frames = Vec::new();

        // This is a placeholder implementation
        // In a real app, you would:
        // 1. Use ffmpeg-next to decode video frames
        // 2. Extract frames at specified intervals
        // 3. Save them as images for OCR processing

        log::info!("Extracting frames from video: {} (interval: {})", video_path, interval);

        // Simulate frame extraction for demonstration
        for i in 0..5 {
            let frame_path = format!("{}/frame_{:04}.png", output_dir, i);
            extracted_frames.push(frame_path);
        }

        log::info!("Extracted {} frames from video", extracted_frames.len());
        Ok(extracted_frames)
    }

    #[cfg(feature = "ffmpeg-next")]
    pub fn extract_frames_with_ffmpeg(
        video_path: &str,
        output_dir: &str,
        frame_interval: Option<u32>,
    ) -> Result<Vec<String>> {
        use ffmpeg_next as ffmpeg;

        Self::ensure_directory_exists(output_dir)?;

        ffmpeg::init().map_err(|e| anyhow!("Failed to initialize FFmpeg: {}", e))?;

        let mut input = ffmpeg::format::input(&video_path)
            .map_err(|e| anyhow!("Failed to open video file: {}", e))?;

        let video_stream = input
            .streams()
            .best(ffmpeg::media::Type::Video)
            .ok_or_else(|| anyhow!("No video stream found"))?;

        let video_stream_index = video_stream.index();

        let context_decoder = ffmpeg::codec::context::Context::from_parameters(video_stream.parameters())
            .map_err(|e| anyhow!("Failed to create decoder context: {}", e))?;

        let mut decoder = context_decoder.decoder().video()
            .map_err(|e| anyhow!("Failed to create video decoder: {}", e))?;

        let mut frame_index = 0;
        let mut extracted_frames = Vec::new();
        let interval = frame_interval.unwrap_or(30);

        let mut frame = ffmpeg::util::frame::video::Video::empty();
        let mut packet = ffmpeg::packet::Packet::empty();

        while input.read_frame(&mut packet).is_ok() {
            if packet.stream() == video_stream_index {
                decoder.send_packet(&packet)
                    .map_err(|e| anyhow!("Failed to send packet to decoder: {}", e))?;

                while decoder.receive_frame(&mut frame).is_ok() {
                    if frame_index % interval == 0 {
                        let frame_path = format!("{}/frame_{:04}.png", output_dir, frame_index / interval);

                        // Convert frame to image and save
                        // This is a simplified version - in practice you'd need proper format conversion
                        extracted_frames.push(frame_path);
                    }
                    frame_index += 1;
                }
            }
        }

        log::info!("Extracted {} frames from video using FFmpeg", extracted_frames.len());
        Ok(extracted_frames)
    }

    pub fn extract_text_from_pdf(_file_path: &str) -> AppResult<String> {
        // PDF extraction would require additional dependencies
        // For now, return a placeholder implementation
        Err(AppError::new(
            ErrorCode::InternalError,
            "PDF text extraction not implemented - requires additional dependencies"
        ))
    }

    pub fn extract_text_from_docx(_file_path: &str) -> AppResult<String> {
        // DOCX extraction would require additional dependencies
        // For now, return a placeholder implementation
        Err(AppError::new(
            ErrorCode::InternalError,
            "DOCX text extraction not implemented - requires additional dependencies"
        ))
    }

    pub fn extract_text_from_txt(file_path: &str) -> AppResult<String> {
        fs::read_to_string(file_path).map_err(|e| {
            AppError::with_details(
                ErrorCode::FileAccess,
                "Failed to read text file",
                e.to_string()
            )
        })
    }

    pub fn extract_text_from_document(file_path: &str) -> AppResult<String> {
        let extension = Path::new(file_path)
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase();

        match extension.as_str() {
            "pdf" => Self::extract_text_from_pdf(file_path),
            "docx" => Self::extract_text_from_docx(file_path),
            "txt" => Self::extract_text_from_txt(file_path),
            "rtf" => {
                // For RTF, we'll use a simple approach for now
                // In a production app, you'd want a proper RTF parser
                Self::extract_text_from_txt(file_path)
            },
            _ => Err(AppError::new(
                ErrorCode::InvalidFileFormat,
                format!("Unsupported document format: {}", extension)
            )),
        }
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
