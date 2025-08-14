use crate::services::{ExportRecord, CSVExporterService, OCRService, GrammarService, PreprocessingOptions};
use anyhow::Result;
use std::path::Path;
use std::fs;
use tokio::sync::Mutex;

// Batch processing state
pub struct BatchState {
    pub is_processing: bool,
    pub current_file_index: usize,
    pub total_files: usize,
    pub completed_files: usize,
    pub failed_files: usize,
    pub start_time: std::time::Instant,
}

impl Default for BatchState {
    fn default() -> Self {
        Self {
            is_processing: false,
            current_file_index: 0,
            total_files: 0,
            completed_files: 0,
            failed_files: 0,
            start_time: std::time::Instant::now(),
        }
    }
}

// Batch processing result
#[derive(serde::Serialize, serde::Deserialize)]
pub struct BatchProcessingResult {
    pub file_path: String,
    pub success: bool,
    pub original_text: String,
    pub corrected_text: String,
    pub grammar_error_count: usize,
    pub ocr_confidence: f32,
    pub processing_time: f64,
    pub error_message: Option<String>,
}

// Batch processing progress
#[derive(serde::Serialize, serde::Deserialize)]
pub struct BatchProgress {
    pub is_processing: bool,
    pub current_file_index: usize,
    pub total_files: usize,
    pub completed_files: usize,
    pub failed_files: usize,
    pub elapsed_time_seconds: f64,
    pub estimated_remaining_seconds: f64,
    pub current_file_path: String,
}

// Global batch state (in a real app, this should be managed better)
pub type BatchStateType = Mutex<BatchState>;

#[tauri::command]
pub async fn batch_process_files(
    file_paths: Vec<String>,
    auto_correct: bool,
    batch_state: tauri::State<'_, BatchStateType>,
) -> Result<Vec<BatchProcessingResult>, String> {
    let mut state = batch_state.lock().await;
    
    if state.is_processing {
        return Err("Batch processing is already in progress".to_string());
    }
    
    state.is_processing = true;
    state.total_files = file_paths.len();
    state.current_file_index = 0;
    state.completed_files = 0;
    state.failed_files = 0;
    state.start_time = std::time::Instant::now();
    drop(state);
    
    let mut results = Vec::new();

    // Group files by size for optimized processing
    let (small_files, large_files) = group_files_by_size(&file_paths, 1024 * 1024).await; // 1MB threshold

    // Process small files in batches for better performance
    if !small_files.is_empty() {
        log::info!("Processing {} small files in batch mode", small_files.len());
        match process_small_files_batch(&small_files, auto_correct, &batch_state).await {
            Ok(batch_results) => {
                results.extend(batch_results);
            }
            Err(e) => {
                log::error!("Batch processing failed: {}", e);
                // Fallback to individual processing for small files
                for file_path in &small_files {
                    let result = process_single_file_batch(file_path, auto_correct).await;
                    results.push(result);
                }
            }
        }
    }

    // Process large files individually
    for (index, file_path) in large_files.iter().enumerate() {
        // Update current file index
        {
            let mut state = batch_state.lock().await;
            state.current_file_index = small_files.len() + index;
        }

        let result = process_single_file_batch(file_path, auto_correct).await;

        // Update counters
        {
            let mut state = batch_state.lock().await;
            if result.success {
                state.completed_files += 1;
            } else {
                state.failed_files += 1;
            }
        }

        results.push(result);
    }
    
    // Mark processing as complete
    {
        let mut state = batch_state.lock().await;
        state.is_processing = false;
    }
    
    Ok(results)
}

#[tauri::command]
pub async fn get_batch_progress(
    batch_state: tauri::State<'_, BatchStateType>,
) -> Result<BatchProgress, String> {
    let state = batch_state.lock().await;
    
    let elapsed_seconds = state.start_time.elapsed().as_secs_f64();
    let files_processed = state.completed_files + state.failed_files;
    
    let estimated_remaining = if files_processed > 0 && state.total_files > files_processed {
        let avg_time_per_file = elapsed_seconds / files_processed as f64;
        let remaining_files = state.total_files - files_processed;
        avg_time_per_file * remaining_files as f64
    } else {
        0.0
    };
    
    Ok(BatchProgress {
        is_processing: state.is_processing,
        current_file_index: state.current_file_index,
        total_files: state.total_files,
        completed_files: state.completed_files,
        failed_files: state.failed_files,
        elapsed_time_seconds: elapsed_seconds,
        estimated_remaining_seconds: estimated_remaining,
        current_file_path: String::new(), // Would need to track this separately
    })
}

#[tauri::command]
pub async fn cancel_batch_processing(
    batch_state: tauri::State<'_, BatchStateType>,
) -> Result<(), String> {
    let mut state = batch_state.lock().await;
    state.is_processing = false;
    Ok(())
}

#[tauri::command]
pub async fn batch_export_results(
    results: Vec<BatchProcessingResult>,
    export_path: String,
    include_failed: bool,
) -> Result<String, String> {
    let export_records: Vec<ExportRecord> = results
        .into_iter()
        .filter(|r| r.success || include_failed)
        .map(|r| ExportRecord {
            timestamp: chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string(),
            original_text: r.original_text,
            corrected_text: r.corrected_text,
            grammar_error_count: r.grammar_error_count,
            ocr_engine: "Batch Processing".to_string(),
            ocr_confidence: r.ocr_confidence,
            processing_time: r.processing_time,
            source_type: "Batch".to_string(),
            error_summary: r.error_message.unwrap_or_default(),
        })
        .collect();
    
    CSVExporterService::export_multiple_records(&export_path, &export_records, None)
        .map_err(|e| format!("Export failed: {}", e))?;
    
    Ok(format!("Exported {} records to {}", export_records.len(), export_path))
}

#[tauri::command]
pub async fn get_batch_statistics(
    results: Vec<BatchProcessingResult>,
) -> Result<serde_json::Value, String> {
    let total_files = results.len();
    let successful_files = results.iter().filter(|r| r.success).count();
    let failed_files = total_files - successful_files;
    
    let total_processing_time: f64 = results.iter().map(|r| r.processing_time).sum();
    let avg_processing_time = if total_files > 0 {
        total_processing_time / total_files as f64
    } else {
        0.0
    };
    
    let total_words: usize = results
        .iter()
        .map(|r| r.original_text.split_whitespace().count())
        .sum();
    
    let total_errors: usize = results.iter().map(|r| r.grammar_error_count).sum();
    
    let avg_confidence: f64 = if successful_files > 0 {
        results
            .iter()
            .filter(|r| r.success)
            .map(|r| r.ocr_confidence as f64)
            .sum::<f64>()
            / successful_files as f64
    } else {
        0.0
    };
    
    let stats = serde_json::json!({
        "total_files": total_files,
        "successful_files": successful_files,
        "failed_files": failed_files,
        "success_rate": if total_files > 0 { (successful_files as f64 / total_files as f64) * 100.0 } else { 0.0 },
        "total_processing_time": total_processing_time,
        "avg_processing_time": avg_processing_time,
        "total_words": total_words,
        "total_errors": total_errors,
        "avg_confidence": avg_confidence,
    });
    
    Ok(stats)
}

async fn process_single_file_batch(file_path: &str, auto_correct: bool) -> BatchProcessingResult {
    let start_time = std::time::Instant::now();
    
    // Validate file exists
    if !Path::new(file_path).exists() {
        return BatchProcessingResult {
            file_path: file_path.to_string(),
            success: false,
            original_text: String::new(),
            corrected_text: String::new(),
            grammar_error_count: 0,
            ocr_confidence: 0.0,
            processing_time: start_time.elapsed().as_secs_f64(),
            error_message: Some("File not found".to_string()),
        };
    }
    
    // Try to process the file
    match process_file_internal(file_path, auto_correct).await {
        Ok((original_text, corrected_text, error_count, confidence)) => {
            BatchProcessingResult {
                file_path: file_path.to_string(),
                success: true,
                original_text,
                corrected_text,
                grammar_error_count: error_count,
                ocr_confidence: confidence,
                processing_time: start_time.elapsed().as_secs_f64(),
                error_message: None,
            }
        }
        Err(e) => {
            BatchProcessingResult {
                file_path: file_path.to_string(),
                success: false,
                original_text: String::new(),
                corrected_text: String::new(),
                grammar_error_count: 0,
                ocr_confidence: 0.0,
                processing_time: start_time.elapsed().as_secs_f64(),
                error_message: Some(e.to_string()),
            }
        }
    }
}

async fn process_file_internal(
    file_path: &str,
    auto_correct: bool,
) -> Result<(String, String, usize, f32)> {
    // Initialize services
    let mut ocr_service = OCRService::new()
        .map_err(|e| anyhow::anyhow!("Failed to initialize OCR service: {}", e))?;

    let grammar_service = GrammarService::new();

    // Extract text using OCR
    let ocr_result = ocr_service
        .extract_text_from_image(file_path, Some(PreprocessingOptions::default()))
        .await
        .map_err(|e| anyhow::anyhow!("OCR processing failed: {}", e))?;

    let original_text = ocr_result.text;
    let confidence = ocr_result.confidence;

    // Apply grammar correction if requested
    let (corrected_text, error_count) = if auto_correct && !original_text.is_empty() {
        match grammar_service.check_text(&original_text, true).await {
            Ok(grammar_result) => (grammar_result.corrected_text, grammar_result.error_count),
            Err(e) => {
                log::warn!("Grammar check failed for {}: {}", file_path, e);
                (original_text.clone(), 0)
            }
        }
    } else {
        (original_text.clone(), 0)
    };

    Ok((original_text, corrected_text, error_count, confidence))
}

async fn group_files_by_size(file_paths: &[String], size_threshold: u64) -> (Vec<String>, Vec<String>) {
    let mut small_files = Vec::new();
    let mut large_files = Vec::new();

    for file_path in file_paths {
        if let Ok(metadata) = fs::metadata(file_path) {
            if metadata.len() <= size_threshold {
                small_files.push(file_path.clone());
            } else {
                large_files.push(file_path.clone());
            }
        } else {
            // If we can't get metadata, treat as large file for safety
            large_files.push(file_path.clone());
        }
    }

    (small_files, large_files)
}

async fn process_small_files_batch(
    file_paths: &[String],
    auto_correct: bool,
    batch_state: &tauri::State<'_, BatchStateType>,
) -> Result<Vec<BatchProcessingResult>, String> {
    let mut ocr_service = OCRService::new()
        .map_err(|e| format!("Failed to initialize OCR service: {}", e))?;

    let grammar_service = GrammarService::new();

    // Use batch OCR processing for small files
    let batch_result = ocr_service
        .extract_text_from_images_batch(
            file_paths.to_vec(),
            Some(PreprocessingOptions::default()),
        )
        .await
        .map_err(|e| format!("Batch OCR processing failed: {}", e))?;

    let mut results = Vec::new();

    // Process each OCR result with grammar checking
    for (index, ocr_result) in batch_result.results.iter().enumerate() {
        let file_path = file_paths.get(index).unwrap_or(&"unknown".to_string()).clone();

        let (corrected_text, error_count) = if auto_correct && !ocr_result.text.is_empty() {
            match grammar_service.check_text(&ocr_result.text, true).await {
                Ok(grammar_result) => (grammar_result.corrected_text, grammar_result.error_count),
                Err(e) => {
                    log::warn!("Grammar check failed for {}: {}", file_path, e);
                    (ocr_result.text.clone(), 0)
                }
            }
        } else {
            (ocr_result.text.clone(), 0)
        };

        let batch_processing_result = BatchProcessingResult {
            file_path,
            success: !ocr_result.text.is_empty(),
            original_text: ocr_result.text.clone(),
            corrected_text,
            grammar_error_count: error_count,
            ocr_confidence: ocr_result.confidence,
            processing_time: ocr_result.processing_time,
            error_message: if ocr_result.text.is_empty() {
                Some("No text extracted".to_string())
            } else {
                None
            },
        };

        // Update batch state
        {
            let mut state = batch_state.lock().await;
            if batch_processing_result.success {
                state.completed_files += 1;
            } else {
                state.failed_files += 1;
            }
        }

        results.push(batch_processing_result);
    }

    log::info!("Batch processing completed: {} files processed in {:.2}s",
              batch_result.files_processed, batch_result.total_processing_time);

    Ok(results)
}
