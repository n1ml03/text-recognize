use crate::services::{FileHandlerService, FileInfo};
use anyhow::Result;

#[tauri::command]
pub async fn get_file_info(file_path: String) -> Result<FileInfo, String> {
    FileHandlerService::get_file_info(&file_path)
        .map_err(|e| format!("Failed to get file info: {}", e))
}

#[tauri::command]
pub async fn validate_file_path(file_path: String) -> Result<bool, String> {
    match FileHandlerService::validate_file_path(&file_path) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub async fn is_supported_image(file_path: String) -> Result<bool, String> {
    Ok(FileHandlerService::is_supported_image(&file_path))
}

#[tauri::command]
pub async fn is_supported_video(file_path: String) -> Result<bool, String> {
    Ok(FileHandlerService::is_supported_video(&file_path))
}

#[tauri::command]
pub async fn is_supported_document(file_path: String) -> Result<bool, String> {
    Ok(FileHandlerService::is_supported_document(&file_path))
}

#[tauri::command]
pub async fn is_supported_pdf(file_path: String) -> Result<bool, String> {
    Ok(FileHandlerService::is_supported_pdf(&file_path))
}

#[tauri::command]
pub async fn get_supported_formats() -> Result<(Vec<String>, Vec<String>, Vec<String>, Vec<String>), String> {
    let image_formats = FileHandlerService::get_supported_image_extensions();
    let video_formats = FileHandlerService::get_supported_video_extensions();
    let document_formats = FileHandlerService::get_supported_document_extensions();
    let pdf_formats = FileHandlerService::get_supported_pdf_extensions();
    Ok((image_formats, video_formats, document_formats, pdf_formats))
}

#[tauri::command]
pub async fn get_all_supported_formats() -> Result<Vec<String>, String> {
    Ok(FileHandlerService::get_all_supported_extensions())
}

#[tauri::command]
pub async fn format_file_size(size_bytes: u64) -> Result<String, String> {
    Ok(FileHandlerService::get_file_size_formatted(size_bytes))
}

#[tauri::command]
pub async fn create_backup_path(original_path: String) -> Result<String, String> {
    FileHandlerService::create_backup_path(&original_path)
        .map_err(|e| format!("Failed to create backup path: {}", e))
}

#[tauri::command]
pub async fn ensure_directory_exists(dir_path: String) -> Result<(), String> {
    FileHandlerService::ensure_directory_exists(&dir_path)
        .map_err(|e| format!("Failed to ensure directory exists: {}", e))
}

#[tauri::command]
pub async fn extract_text_from_document(file_path: String) -> Result<String, String> {
    FileHandlerService::extract_text_from_document(&file_path)
        .map_err(|e| format!("Failed to extract text from document: {}", e))
}

#[tauri::command]
pub async fn extract_text_from_pdf(file_path: String) -> Result<String, String> {
    FileHandlerService::extract_text_from_pdf(&file_path)
        .map_err(|e| format!("Failed to extract text from PDF: {}", e))
}

#[tauri::command]
pub async fn extract_frames_from_video(
    video_path: String,
    output_dir: String,
    frame_interval: Option<u32>,
) -> Result<Vec<String>, String> {
    FileHandlerService::extract_frames_from_video(&video_path, &output_dir, frame_interval)
        .map_err(|e| format!("Failed to extract frames from video: {}", e))
}

#[tauri::command]
pub async fn cleanup_temp_files(temp_dir: String) -> Result<(), String> {
    FileHandlerService::cleanup_temp_files(&temp_dir)
        .map_err(|e| format!("Failed to cleanup temp files: {}", e))
}
