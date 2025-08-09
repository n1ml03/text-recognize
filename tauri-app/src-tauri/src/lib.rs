mod services;
mod commands;

use commands::*;
use services::*;
use tokio::sync::Mutex;

// Initialize services
pub fn create_ocr_state() -> OCRState {
    match OCRService::new() {
        Ok(service) => OCRState(Mutex::new(service)),
        Err(e) => {
            log::error!("Failed to initialize OCR service: {}", e);
            panic!("Cannot start application without OCR service");
        }
    }
}

pub fn create_grammar_state() -> GrammarState {
    GrammarState(Mutex::new(GrammarService::new()))
}

pub fn create_batch_state() -> commands::batch_commands::BatchStateType {
    Mutex::new(commands::batch_commands::BatchState::default())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Logging will be initialized by Tauri plugin

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(create_ocr_state())
        .manage(create_grammar_state())
        .manage(create_batch_state())
        .invoke_handler(tauri::generate_handler![
            // OCR commands
            process_image_ocr,
            get_preprocessing_preview,
            validate_image_file,
            get_supported_image_formats,
            extract_video_frames,
            // Grammar commands
            check_grammar,
            smart_grammar_check,
            apply_specific_corrections,
            apply_selective_corrections,
            get_language_statistics,
            set_grammar_server_url,
            set_grammar_config,
            get_grammar_providers,
            get_supported_languages,
            // File commands
            get_file_info,
            validate_file_path,
            is_supported_image,
            is_supported_video,
            is_supported_document,
            is_supported_pdf,
            get_supported_formats,
            get_all_supported_formats,
            extract_text_from_document,
            extract_text_from_pdf,
            extract_frames_from_video,
            format_file_size,
            create_backup_path,
            ensure_directory_exists,
            cleanup_temp_files,
            // Export commands
            export_to_csv,
            export_multiple_to_csv,
            read_csv_file,
            get_csv_statistics,
            create_csv_backup,
            validate_export_record,
            create_export_record,
            // Batch commands
            batch_process_files,
            get_batch_progress,
            cancel_batch_processing,
            batch_export_results,
            get_batch_statistics,
        ])
        .setup(|_app| {
            // Setup complete
            println!("OCR & Grammar Assistant started successfully!");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
