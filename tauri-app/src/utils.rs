use crate::error::{AppError, AppResult, ErrorCode};
use std::path::Path;

/// Common file extension checking utilities
pub mod file_extensions {
    use super::*;

    /// Supported file extensions organized by category
    pub struct SupportedExtensions;

    impl SupportedExtensions {
        pub const IMAGE_EXTENSIONS: &'static [&'static str] = &[
            "png", "jpg", "jpeg", "bmp", "tiff", "tif", "gif", "webp"
        ];

        pub const VIDEO_EXTENSIONS: &'static [&'static str] = &[
            "mp4", "avi", "mov", "mkv", "wmv", "flv", "m4v", "3gp", "webm", "ogv"
        ];

        pub const DOCUMENT_EXTENSIONS: &'static [&'static str] = &[
            "docx", "doc", "rtf", "odt", "txt"
        ];

        pub const PDF_EXTENSIONS: &'static [&'static str] = &["pdf"];

        /// Check if a file has a supported image extension
        pub fn is_image(file_path: &str) -> bool {
            Self::has_extension(file_path, Self::IMAGE_EXTENSIONS)
        }

        /// Check if a file has a supported video extension
        pub fn is_video(file_path: &str) -> bool {
            Self::has_extension(file_path, Self::VIDEO_EXTENSIONS)
        }

        /// Check if a file has a supported document extension
        pub fn is_document(file_path: &str) -> bool {
            Self::has_extension(file_path, Self::DOCUMENT_EXTENSIONS)
        }

        /// Check if a file has a PDF extension
        pub fn is_pdf(file_path: &str) -> bool {
            Self::has_extension(file_path, Self::PDF_EXTENSIONS)
        }

        /// Get all supported extensions as a vector
        pub fn get_all() -> Vec<String> {
            let mut extensions = Vec::new();
            extensions.extend(Self::IMAGE_EXTENSIONS.iter().map(|s| s.to_string()));
            extensions.extend(Self::VIDEO_EXTENSIONS.iter().map(|s| s.to_string()));
            extensions.extend(Self::DOCUMENT_EXTENSIONS.iter().map(|s| s.to_string()));
            extensions.extend(Self::PDF_EXTENSIONS.iter().map(|s| s.to_string()));
            extensions
        }

        /// Get extensions by category
        pub fn get_by_category() -> (Vec<String>, Vec<String>, Vec<String>, Vec<String>) {
            (
                Self::IMAGE_EXTENSIONS.iter().map(|s| s.to_string()).collect(),
                Self::VIDEO_EXTENSIONS.iter().map(|s| s.to_string()).collect(),
                Self::DOCUMENT_EXTENSIONS.iter().map(|s| s.to_string()).collect(),
                Self::PDF_EXTENSIONS.iter().map(|s| s.to_string()).collect(),
            )
        }

        /// Helper function to check if a file has any of the given extensions
        fn has_extension(file_path: &str, extensions: &[&str]) -> bool {
            if let Some(ext) = Path::new(file_path)
                .extension()
                .and_then(|e| e.to_str())
            {
                extensions.contains(&ext.to_lowercase().as_str())
            } else {
                false
            }
        }
    }
}

/// Common file validation utilities
pub mod file_validation {
    use super::*;
    use std::fs;

    /// Validate that a file path exists and is accessible
    pub fn validate_file_path(file_path: &str) -> AppResult<()> {
        let path = Path::new(file_path);
        
        if !path.exists() {
            return Err(AppError::new(
                ErrorCode::FileNotFound,
                format!("File does not exist: {}", file_path)
            ));
        }

        if !path.is_file() {
            return Err(AppError::new(
                ErrorCode::FileValidation,
                format!("Path is not a file: {}", file_path)
            ));
        }

        // Check if file is readable
        match fs::File::open(path) {
            Ok(_) => Ok(()),
            Err(e) => Err(AppError::with_details(
                ErrorCode::FileAccess,
                "Cannot read file",
                e.to_string()
            )),
        }
    }

    /// Get file metadata safely
    pub fn get_file_metadata(file_path: &str) -> AppResult<fs::Metadata> {
        validate_file_path(file_path)?;
        
        fs::metadata(file_path).map_err(|e| {
            AppError::with_details(
                ErrorCode::FileAccess,
                "Failed to read file metadata",
                e.to_string()
            )
        })
    }
}

/// Common string and text processing utilities
pub mod text_processing {
    /// Clean text for CSV export by removing problematic characters
    pub fn clean_for_csv(text: &str, max_length: usize) -> String {
        let cleaned = text
            .replace('\n', " ")
            .replace('\r', " ")
            .replace('\t', " ")
            .replace('"', "'");

        if cleaned.len() > max_length {
            format!("{}...", &cleaned[..max_length.saturating_sub(3)])
        } else {
            cleaned
        }
    }

    /// Format file size in human-readable format
    pub fn format_file_size(size_bytes: u64) -> String {
        const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB"];
        const THRESHOLD: f64 = 1024.0;

        if size_bytes == 0 {
            return "0 B".to_string();
        }

        let size = size_bytes as f64;
        let unit_index = (size.log10() / THRESHOLD.log10()).floor() as usize;
        let unit_index = unit_index.min(UNITS.len() - 1);

        let size_in_unit = size / THRESHOLD.powi(unit_index as i32);

        if unit_index == 0 {
            format!("{} {}", size_bytes, UNITS[unit_index])
        } else {
            format!("{:.1} {}", size_in_unit, UNITS[unit_index])
        }
    }


}

/// Common path utilities
pub mod path_utils {
    use super::*;


    /// Create a backup path for a given file
    pub fn create_backup_path(original_path: &str) -> AppResult<String> {
        let path = Path::new(original_path);
        
        let parent = path.parent().ok_or_else(|| {
            AppError::new(ErrorCode::FileValidation, "Cannot determine parent directory")
        })?;

        let stem = path.file_stem().and_then(|s| s.to_str()).ok_or_else(|| {
            AppError::new(ErrorCode::FileValidation, "Cannot determine file name")
        })?;

        let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("");

        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
        
        let backup_name = if extension.is_empty() {
            format!("{}_backup_{}", stem, timestamp)
        } else {
            format!("{}_backup_{}.{}", stem, timestamp, extension)
        };

        let backup_path = parent.join(backup_name);
        
        Ok(backup_path.to_string_lossy().to_string())
    }

    /// Ensure a directory exists, creating it if necessary
    pub fn ensure_directory_exists(dir_path: &str) -> AppResult<()> {
        let path = Path::new(dir_path);
        
        if path.exists() && !path.is_dir() {
            return Err(AppError::new(
                ErrorCode::FileValidation,
                format!("Path exists but is not a directory: {}", dir_path)
            ));
        }

        if !path.exists() {
            std::fs::create_dir_all(path).map_err(|e| {
                AppError::with_details(
                    ErrorCode::FileAccess,
                    "Failed to create directory",
                    e.to_string()
                )
            })?;
        }

        Ok(())
    }
}


