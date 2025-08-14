mod error;
mod utils;
pub mod services;
mod commands;

use crate::services::ocr::OCRService;
use crate::services::grammar::GrammarService;
use commands::ocr_commands::{
    process_image_ocr,
    process_video_ocr,
    shutdown_ocr_service,
    validate_image_file,
    get_supported_image_formats,
    extract_video_frames,
    OCRState,
};
use commands::grammar_commands::{
    check_grammar,
    smart_grammar_check,
    apply_specific_corrections,
    apply_selective_corrections,
    get_language_statistics,
    set_grammar_server_url,
    set_grammar_config,
    get_grammar_providers,
    get_supported_languages,
    GrammarState,
};
use commands::file_commands::{
    get_file_info,
    validate_file_path,
    is_supported_image,
    is_supported_video,
    is_supported_document,
    is_supported_pdf,
    get_supported_formats,
    get_all_supported_formats,
    extract_text_from_document,
    extract_frames_from_video,
    format_file_size,
    create_backup_path,
    ensure_directory_exists,
    cleanup_temp_files,
};
use commands::export_commands::{
    export_to_csv,
    export_multiple_to_csv,
    read_csv_file,
    get_csv_statistics,
    create_csv_backup,
    validate_export_record,
    create_export_record,
};
use commands::batch_commands::{
    batch_process_files,
    get_batch_progress,
    cancel_batch_processing,
    batch_export_results,
    get_batch_statistics,
};
use tokio::sync::Mutex;
use tauri::{Manager, Listener};

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
            process_video_ocr,
            shutdown_ocr_service,
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
        .setup(|app| {
            // Setup complete
            println!("OCR & Grammar Assistant started successfully!");

            // Register cleanup handler for app shutdown
            let app_handle = app.handle().clone();
            app.listen("tauri://close-requested", move |_event| {
                // Perform cleanup when app is closing
                let handle = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    if let Some(ocr_state) = handle.try_state::<OCRState>() {
                        let ocr_service = ocr_state.inner().0.lock().await;
                        if let Err(e) = ocr_service.shutdown().await {
                            log::error!("Error during OCR service shutdown: {}", e);
                        }
                    }
                });
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
