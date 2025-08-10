use anyhow::Result as AnyhowResult;
use serde::{Deserialize, Serialize};

/// Unified error type for the application
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppError {
    pub code: ErrorCode,
    pub message: String,
    pub details: Option<String>,
}

/// Error codes for different types of errors
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ErrorCode {
    // OCR related errors
    OcrInitialization,
    OcrProcessing,
    ImageLoading,
    ImagePreprocessing,
    
    // Grammar checking errors
    GrammarService,
    LanguageToolConnection,
    GrammarProcessing,
    
    // File handling errors
    FileNotFound,
    FileAccess,
    InvalidFileFormat,
    FileValidation,
    
    // Export/CSV errors
    CsvExport,
    CsvImport,
    DataValidation,
    
    // Batch processing errors
    BatchProcessing,
    BatchCancellation,
    
    // General errors
    InvalidInput,
    ServiceUnavailable,
    InternalError,
}

impl AppError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            details: None,
        }
    }

    pub fn with_details(code: ErrorCode, message: impl Into<String>, details: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            details: Some(details.into()),
        }
    }

    /// Convert to a string suitable for Tauri command responses
    pub fn to_tauri_error(&self) -> String {
        match &self.details {
            Some(details) => format!("{}: {}", self.message, details),
            None => self.message.clone(),
        }
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match &self.details {
            Some(details) => write!(f, "{}: {}", self.message, details),
            None => write!(f, "{}", self.message),
        }
    }
}

impl std::error::Error for AppError {}

impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        AppError::new(ErrorCode::InternalError, err.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        let code = match err.kind() {
            std::io::ErrorKind::NotFound => ErrorCode::FileNotFound,
            std::io::ErrorKind::PermissionDenied => ErrorCode::FileAccess,
            _ => ErrorCode::InternalError,
        };
        AppError::new(code, err.to_string())
    }
}

impl From<csv::Error> for AppError {
    fn from(err: csv::Error) -> Self {
        AppError::new(ErrorCode::CsvExport, err.to_string())
    }
}

/// Result type alias for the application
pub type AppResult<T> = Result<T, AppError>;

/// Trait for converting results to Tauri-compatible string errors
pub trait ToTauriResult<T> {
    fn to_tauri_result(self) -> Result<T, String>;
}

impl<T> ToTauriResult<T> for AppResult<T> {
    fn to_tauri_result(self) -> Result<T, String> {
        self.map_err(|e| e.to_tauri_error())
    }
}

impl<T> ToTauriResult<T> for AnyhowResult<T> {
    fn to_tauri_result(self) -> Result<T, String> {
        self.map_err(|e| e.to_string())
    }
}

/// Convenience macros for creating errors
#[macro_export]
macro_rules! ocr_error {
    ($msg:expr) => {
        AppError::new(ErrorCode::OcrProcessing, $msg)
    };
    ($msg:expr, $details:expr) => {
        AppError::with_details(ErrorCode::OcrProcessing, $msg, $details)
    };
}

#[macro_export]
macro_rules! grammar_error {
    ($msg:expr) => {
        AppError::new(ErrorCode::GrammarProcessing, $msg)
    };
    ($msg:expr, $details:expr) => {
        AppError::with_details(ErrorCode::GrammarProcessing, $msg, $details)
    };
}

#[macro_export]
macro_rules! file_error {
    ($msg:expr) => {
        AppError::new(ErrorCode::FileValidation, $msg)
    };
    ($msg:expr, $details:expr) => {
        AppError::with_details(ErrorCode::FileValidation, $msg, $details)
    };
}

#[macro_export]
macro_rules! csv_error {
    ($msg:expr) => {
        AppError::new(ErrorCode::CsvExport, $msg)
    };
    ($msg:expr, $details:expr) => {
        AppError::with_details(ErrorCode::CsvExport, $msg, $details)
    };
}

#[macro_export]
macro_rules! batch_error {
    ($msg:expr) => {
        AppError::new(ErrorCode::BatchProcessing, $msg)
    };
    ($msg:expr, $details:expr) => {
        AppError::with_details(ErrorCode::BatchProcessing, $msg, $details)
    };
}

/// Helper functions for common error scenarios
pub mod helpers {
    use super::*;

    pub fn file_not_found(path: &str) -> AppError {
        AppError::new(ErrorCode::FileNotFound, format!("File not found: {}", path))
    }

    pub fn invalid_file_format(path: &str, expected: &str) -> AppError {
        AppError::with_details(
            ErrorCode::InvalidFileFormat,
            format!("Invalid file format for: {}", path),
            format!("Expected: {}", expected),
        )
    }

    pub fn service_unavailable(service: &str) -> AppError {
        AppError::new(
            ErrorCode::ServiceUnavailable,
            format!("{} service is currently unavailable", service),
        )
    }

    pub fn validation_failed(field: &str, reason: &str) -> AppError {
        AppError::with_details(
            ErrorCode::DataValidation,
            format!("Validation failed for {}", field),
            reason,
        )
    }
}
