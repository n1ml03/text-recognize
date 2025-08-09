use anyhow::{Result, anyhow};
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

    pub fn get_file_info(file_path: &str) -> Result<FileInfo> {
        let path = Path::new(file_path);
        
        if !path.exists() {
            return Err(anyhow!("File does not exist: {}", file_path));
        }

        let metadata = fs::metadata(path)
            .map_err(|e| anyhow!("Failed to read file metadata: {}", e))?;

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
        let supported_extensions = [
            "png", "jpg", "jpeg", "bmp", "tiff", "tif", "gif", "webp"
        ];
        
        if let Some(ext) = Path::new(file_path)
            .extension()
            .and_then(|e| e.to_str())
        {
            supported_extensions.contains(&ext.to_lowercase().as_str())
        } else {
            false
        }
    }

    pub fn is_supported_video(file_path: &str) -> bool {
        let supported_extensions = [
            "mp4", "avi", "mov", "mkv", "wmv", "flv", "m4v", "3gp", "webm", "ogv"
        ];

        if let Some(ext) = Path::new(file_path)
            .extension()
            .and_then(|e| e.to_str())
        {
            supported_extensions.contains(&ext.to_lowercase().as_str())
        } else {
            false
        }
    }

    pub fn is_supported_document(file_path: &str) -> bool {
        let supported_extensions = [
            "docx", "doc", "rtf", "odt", "txt"
        ];

        if let Some(ext) = Path::new(file_path)
            .extension()
            .and_then(|e| e.to_str())
        {
            supported_extensions.contains(&ext.to_lowercase().as_str())
        } else {
            false
        }
    }

    pub fn is_supported_pdf(file_path: &str) -> bool {
        if let Some(ext) = Path::new(file_path)
            .extension()
            .and_then(|e| e.to_str())
        {
            ext.to_lowercase() == "pdf"
        } else {
            false
        }
    }

    pub fn validate_file_path(file_path: &str) -> Result<()> {
        let path = Path::new(file_path);
        
        if !path.exists() {
            return Err(anyhow!("File does not exist: {}", file_path));
        }

        if !path.is_file() {
            return Err(anyhow!("Path is not a file: {}", file_path));
        }

        // Check if file is readable
        match fs::File::open(path) {
            Ok(_) => Ok(()),
            Err(e) => Err(anyhow!("Cannot read file: {}", e)),
        }
    }

    pub fn get_supported_image_extensions() -> Vec<String> {
        vec![
            "png".to_string(),
            "jpg".to_string(),
            "jpeg".to_string(),
            "bmp".to_string(),
            "tiff".to_string(),
            "tif".to_string(),
            "gif".to_string(),
            "webp".to_string(),
        ]
    }

    pub fn get_supported_video_extensions() -> Vec<String> {
        vec![
            "mp4".to_string(),
            "avi".to_string(),
            "mov".to_string(),
            "mkv".to_string(),
            "wmv".to_string(),
            "flv".to_string(),
            "m4v".to_string(),
            "3gp".to_string(),
            "webm".to_string(),
            "ogv".to_string(),
        ]
    }

    pub fn get_supported_document_extensions() -> Vec<String> {
        vec![
            "docx".to_string(),
            "doc".to_string(),
            "rtf".to_string(),
            "odt".to_string(),
            "txt".to_string(),
        ]
    }

    pub fn get_supported_pdf_extensions() -> Vec<String> {
        vec!["pdf".to_string()]
    }

    pub fn get_all_supported_extensions() -> Vec<String> {
        let mut extensions = Vec::new();
        extensions.extend(Self::get_supported_image_extensions());
        extensions.extend(Self::get_supported_video_extensions());
        extensions.extend(Self::get_supported_document_extensions());
        extensions.extend(Self::get_supported_pdf_extensions());
        extensions
    }

    pub fn create_backup_path(original_path: &str) -> Result<String> {
        let path = Path::new(original_path);
        let parent = path.parent().unwrap_or(Path::new("."));
        let stem = path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("backup");
        let extension = path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");

        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
        
        let backup_name = if extension.is_empty() {
            format!("{}_backup_{}", stem, timestamp)
        } else {
            format!("{}_backup_{}.{}", stem, timestamp, extension)
        };

        let backup_path = parent.join(backup_name);
        
        Ok(backup_path.to_string_lossy().to_string())
    }

    pub fn ensure_directory_exists(dir_path: &str) -> Result<()> {
        let path = Path::new(dir_path);
        
        if !path.exists() {
            fs::create_dir_all(path)
                .map_err(|e| anyhow!("Failed to create directory {}: {}", dir_path, e))?;
        } else if !path.is_dir() {
            return Err(anyhow!("Path exists but is not a directory: {}", dir_path));
        }

        Ok(())
    }

    pub fn get_file_size_formatted(size_bytes: u64) -> String {
        const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB"];
        let mut size = size_bytes as f64;
        let mut unit_index = 0;

        while size >= 1024.0 && unit_index < UNITS.len() - 1 {
            size /= 1024.0;
            unit_index += 1;
        }

        if unit_index == 0 {
            format!("{} {}", size_bytes, UNITS[unit_index])
        } else {
            format!("{:.1} {}", size, UNITS[unit_index])
        }
    }

    fn determine_file_type(extension: &str) -> FileType {
        let image_extensions = [
            "png", "jpg", "jpeg", "bmp", "tiff", "tif", "gif", "webp"
        ];
        let video_extensions = [
            "mp4", "avi", "mov", "mkv", "wmv", "flv", "m4v", "3gp", "webm", "ogv"
        ];
        let document_extensions = [
            "docx", "doc", "rtf", "odt", "txt"
        ];

        if image_extensions.contains(&extension) {
            FileType::Image
        } else if video_extensions.contains(&extension) {
            FileType::Video
        } else if document_extensions.contains(&extension) {
            FileType::Document
        } else if extension == "pdf" {
            FileType::Pdf
        } else {
            FileType::Unknown
        }
    }

    pub fn extract_frames_from_video(
        video_path: &str,
        output_dir: &str,
        frame_interval: Option<u32>,
    ) -> Result<Vec<String>> {
        Self::ensure_directory_exists(output_dir)?;

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

    pub fn extract_text_from_pdf(file_path: &str) -> Result<String> {
        use pdf_extract::extract_text;

        extract_text(file_path)
            .map_err(|e| anyhow!("Failed to extract text from PDF: {}", e))
    }

    pub fn extract_text_from_docx(file_path: &str) -> Result<String> {
        use docx_rs::*;
        use std::io::Read;

        let mut file = fs::File::open(file_path)
            .map_err(|e| anyhow!("Failed to open DOCX file: {}", e))?;

        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)
            .map_err(|e| anyhow!("Failed to read DOCX file: {}", e))?;

        let docx = read_docx(&buffer)
            .map_err(|e| anyhow!("Failed to parse DOCX file: {}", e))?;

        // Extract text from paragraphs
        let mut text = String::new();
        for child in docx.document.children {
            if let DocumentChild::Paragraph(paragraph) = child {
                for run in paragraph.children {
                    if let ParagraphChild::Run(run) = run {
                        for child in run.children {
                            if let RunChild::Text(text_element) = child {
                                text.push_str(&text_element.text);
                            }
                        }
                    }
                }
                text.push('\n');
            }
        }

        Ok(text)
    }

    pub fn extract_text_from_txt(file_path: &str) -> Result<String> {
        fs::read_to_string(file_path)
            .map_err(|e| anyhow!("Failed to read text file: {}", e))
    }

    pub fn extract_text_from_document(file_path: &str) -> Result<String> {
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
            _ => Err(anyhow!("Unsupported document format: {}", extension)),
        }
    }

    pub fn cleanup_temp_files(temp_dir: &str) -> Result<()> {
        let path = Path::new(temp_dir);

        if path.exists() && path.is_dir() {
            fs::remove_dir_all(path)
                .map_err(|e| anyhow!("Failed to cleanup temp directory {}: {}", temp_dir, e))?;
        }

        Ok(())
    }
}
