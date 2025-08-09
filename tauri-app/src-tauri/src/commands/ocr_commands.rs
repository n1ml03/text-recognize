use crate::services::{OCRService, OCRResult, PreprocessingOptions};
use anyhow::Result;
use tokio::sync::Mutex;
use tauri::State;

pub struct OCRState(pub Mutex<OCRService>);

#[tauri::command]
pub async fn process_image_ocr(
    file_path: String,
    preprocessing_options: Option<PreprocessingOptions>,
    state: State<'_, OCRState>,
) -> Result<OCRResult, String> {
    let mut ocr_service = state.0.lock().await;
    ocr_service
        .extract_text_from_image(&file_path, preprocessing_options)
        .await
        .map_err(|e| format!("OCR processing failed: {}", e))
}

#[tauri::command]
pub async fn get_preprocessing_preview(
    file_path: String,
    _state: State<'_, OCRState>,
) -> Result<Vec<String>, String> {
    // This would return base64 encoded preview images showing different preprocessing steps
    // For now, return empty vector as placeholder
    log::info!("Preprocessing preview requested for: {}", file_path);
    Ok(vec![])
}

#[tauri::command]
pub async fn validate_image_file(file_path: String) -> Result<bool, String> {
    use crate::services::FileHandlerService;
    
    match FileHandlerService::validate_file_path(&file_path) {
        Ok(_) => Ok(FileHandlerService::is_supported_image(&file_path)),
        Err(e) => Err(format!("File validation failed: {}", e)),
    }
}

#[tauri::command]
pub async fn get_supported_image_formats() -> Result<Vec<String>, String> {
    use crate::services::FileHandlerService;
    Ok(FileHandlerService::get_supported_image_extensions())
}

#[tauri::command]
pub async fn extract_video_frames(
    video_path: String,
    output_dir: String,
    frame_interval: Option<u32>,
) -> Result<Vec<String>, String> {
    use crate::services::FileHandlerService;
    
    FileHandlerService::extract_frames_from_video(&video_path, &output_dir, frame_interval)
        .map_err(|e| format!("Video frame extraction failed: {}", e))
}
