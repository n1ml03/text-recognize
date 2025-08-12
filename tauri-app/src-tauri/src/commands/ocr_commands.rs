use crate::services::{OCRService, OCRResult, PreprocessingOptions};
use crate::error::ToTauriResult;
use crate::utils::file_extensions::SupportedExtensions;
use crate::utils::file_validation;
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
        .to_tauri_result()
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
    match file_validation::validate_file_path(&file_path) {
        Ok(_) => Ok(SupportedExtensions::is_image(&file_path)),
        Err(e) => Err(e.to_tauri_error()),
    }
}

#[tauri::command]
pub async fn get_supported_image_formats() -> Result<Vec<String>, String> {
    Ok(SupportedExtensions::IMAGE_EXTENSIONS.iter().map(|s| s.to_string()).collect())
}

#[tauri::command]
pub async fn process_video_ocr(
    file_path: String,
    preprocessing_options: Option<PreprocessingOptions>,
    state: State<'_, OCRState>,
) -> Result<OCRResult, String> {
    let mut ocr_service = state.0.lock().await;
    ocr_service
        .extract_text_from_video(&file_path, preprocessing_options)
        .await
        .to_tauri_result()
}

#[tauri::command]
pub async fn shutdown_ocr_service(
    state: State<'_, OCRState>,
) -> Result<(), String> {
    let ocr_service = state.0.lock().await;
    ocr_service.shutdown().await.to_tauri_result()
}

#[tauri::command]
pub async fn extract_video_frames(
    video_path: String,
    output_dir: String,
    frame_interval: Option<u32>,
) -> Result<Vec<String>, String> {
    use crate::services::FileHandlerService;

    FileHandlerService::extract_frames_from_video(&video_path, &output_dir, frame_interval)
        .await
        .to_tauri_result()
}
