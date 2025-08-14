use crate::services::{FileHandlerService, FileInfo};
use crate::error::ToTauriResult;
use crate::utils::file_extensions::SupportedExtensions;
use crate::utils::text_processing;
use crate::utils::path_utils;

#[tauri::command]
pub async fn get_file_info(file_path: String) -> Result<FileInfo, String> {
    FileHandlerService::get_file_info(&file_path).to_tauri_result()
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
    Ok(SupportedExtensions::is_image(&file_path))
}

#[tauri::command]
pub async fn is_supported_video(file_path: String) -> Result<bool, String> {
    Ok(SupportedExtensions::is_video(&file_path))
}

#[tauri::command]
pub async fn is_supported_document(file_path: String) -> Result<bool, String> {
    Ok(SupportedExtensions::is_document(&file_path))
}

#[tauri::command]
pub async fn is_supported_pdf(file_path: String) -> Result<bool, String> {
    Ok(SupportedExtensions::is_pdf(&file_path))
}

#[tauri::command]
pub async fn get_supported_formats() -> Result<(Vec<String>, Vec<String>, Vec<String>, Vec<String>), String> {
    Ok(SupportedExtensions::get_by_category())
}

#[tauri::command]
pub async fn get_all_supported_formats() -> Result<Vec<String>, String> {
    Ok(SupportedExtensions::get_all())
}

#[tauri::command]
pub async fn format_file_size(size_bytes: u64) -> Result<String, String> {
    Ok(text_processing::format_file_size(size_bytes))
}

#[tauri::command]
pub async fn create_backup_path(original_path: String) -> Result<String, String> {
    path_utils::create_backup_path(&original_path).to_tauri_result()
}

#[tauri::command]
pub async fn ensure_directory_exists(dir_path: String) -> Result<(), String> {
    path_utils::ensure_directory_exists(&dir_path).to_tauri_result()
}

#[tauri::command]
pub async fn extract_text_from_document(file_path: String) -> Result<String, String> {
    FileHandlerService::extract_text_from_document(&file_path).await.to_tauri_result()
}



#[tauri::command]
pub async fn extract_frames_from_video(
    video_path: String,
    output_dir: String,
    frame_interval: Option<u32>,
) -> Result<Vec<String>, String> {
    FileHandlerService::extract_frames_from_video(&video_path, &output_dir, frame_interval).await.to_tauri_result()
}

#[tauri::command]
pub async fn cleanup_temp_files(temp_dir: String) -> Result<(), String> {
    FileHandlerService::cleanup_temp_files(&temp_dir).to_tauri_result()
}
