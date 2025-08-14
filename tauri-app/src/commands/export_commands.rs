use crate::services::{CSVExporterService, ExportRecord, ExportOptions, ExportStatistics};
use crate::error::ToTauriResult;

#[tauri::command]
pub async fn export_to_csv(
    file_path: String,
    record: ExportRecord,
    options: Option<ExportOptions>,
) -> Result<(), String> {
    CSVExporterService::export_record(&file_path, &record, options).to_tauri_result()
}

#[tauri::command]
pub async fn export_multiple_to_csv(
    file_path: String,
    records: Vec<ExportRecord>,
    options: Option<ExportOptions>,
) -> Result<(), String> {
    CSVExporterService::export_multiple_records(&file_path, &records, options).to_tauri_result()
}

#[tauri::command]
pub async fn read_csv_file(file_path: String) -> Result<Vec<ExportRecord>, String> {
    CSVExporterService::read_csv_file(&file_path).to_tauri_result()
}

#[tauri::command]
pub async fn get_csv_statistics(file_path: String) -> Result<ExportStatistics, String> {
    CSVExporterService::get_export_statistics(&file_path).to_tauri_result()
}

#[tauri::command]
pub async fn create_csv_backup(file_path: String) -> Result<String, String> {
    CSVExporterService::create_backup(&file_path).to_tauri_result()
}

#[tauri::command]
pub async fn validate_export_record(record: ExportRecord) -> Result<bool, String> {
    match CSVExporterService::validate_export_data(&record) {
        Ok(_) => Ok(true),
        Err(e) => {
            log::warn!("Export record validation failed: {}", e);
            Ok(false)
        }
    }
}

#[tauri::command]
pub async fn create_export_record(
    original_text: String,
    corrected_text: String,
    grammar_error_count: usize,
    ocr_engine: String,
    ocr_confidence: f32,
    processing_time: f64,
    source_type: String,
    error_summary: String,
) -> Result<ExportRecord, String> {
    let timestamp = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string();
    
    let record = ExportRecord {
        timestamp,
        original_text,
        corrected_text,
        grammar_error_count,
        ocr_engine,
        ocr_confidence,
        processing_time,
        source_type,
        error_summary,
    };

    // Validate the record
    CSVExporterService::validate_export_data(&record).to_tauri_result()?;

    Ok(record)
}
