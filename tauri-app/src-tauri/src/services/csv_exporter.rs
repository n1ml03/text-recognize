use anyhow::{Result, anyhow};
use csv::Writer;
use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportRecord {
    pub timestamp: String,
    pub original_text: String,
    pub corrected_text: String,
    pub grammar_error_count: usize,
    pub ocr_engine: String,
    pub ocr_confidence: f32,
    pub processing_time: f64,
    pub source_type: String,
    pub error_summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportOptions {
    pub append_mode: bool,
    pub include_headers: bool,
    pub max_text_length: usize,
}

impl Default for ExportOptions {
    fn default() -> Self {
        Self {
            append_mode: true,
            include_headers: true,
            max_text_length: 1000,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportStatistics {
    pub total_records: usize,
    pub total_grammar_errors: usize,
    pub first_export: String,
    pub last_export: String,
    pub ocr_engines_used: std::collections::HashMap<String, usize>,
    pub file_size_mb: f64,
}

pub struct CSVExporterService;

impl CSVExporterService {
    pub fn new() -> Self {
        Self
    }

    pub fn export_record(
        file_path: &str,
        record: &ExportRecord,
        options: Option<ExportOptions>,
    ) -> Result<()> {
        let opts = options.unwrap_or_default();
        
        // Check if file exists
        let file_exists = Path::new(file_path).exists();
        let write_headers = opts.include_headers && (!file_exists || !opts.append_mode);

        // Open file in appropriate mode
        let file = if opts.append_mode && file_exists {
            OpenOptions::new()
                .create(true)
                .append(true)
                .open(file_path)
                .map_err(|e| anyhow!("Failed to open file for appending: {}", e))?
        } else {
            OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(true)
                .open(file_path)
                .map_err(|e| anyhow!("Failed to create/open file: {}", e))?
        };

        let mut writer = Writer::from_writer(file);

        // Write headers if needed
        if write_headers {
            writer.write_record(&[
                "Timestamp",
                "OriginalText",
                "CorrectedText",
                "GrammarErrorCount",
                "OCREngine",
                "OCRConfidence",
                "ProcessingTime",
                "SourceType",
                "ErrorSummary",
            ])?;
        }

        // Clean and prepare record data
        let clean_original = Self::clean_text_for_csv(&record.original_text, opts.max_text_length);
        let clean_corrected = Self::clean_text_for_csv(&record.corrected_text, opts.max_text_length);
        let clean_error_summary = Self::clean_text_for_csv(&record.error_summary, opts.max_text_length);

        // Write data record
        writer.write_record(&[
            &record.timestamp,
            &clean_original,
            &clean_corrected,
            &record.grammar_error_count.to_string(),
            &record.ocr_engine,
            &format!("{:.3}", record.ocr_confidence),
            &format!("{:.2}", record.processing_time),
            &record.source_type,
            &clean_error_summary,
        ])?;

        writer.flush()?;
        
        log::info!("Successfully exported record to {}", file_path);
        Ok(())
    }

    pub fn export_multiple_records(
        file_path: &str,
        records: &[ExportRecord],
        options: Option<ExportOptions>,
    ) -> Result<()> {
        let opts = options.unwrap_or_default();
        
        if records.is_empty() {
            return Ok(());
        }

        // Check if file exists
        let file_exists = Path::new(file_path).exists();
        let write_headers = opts.include_headers && (!file_exists || !opts.append_mode);

        // Open file in appropriate mode
        let file = if opts.append_mode && file_exists {
            OpenOptions::new()
                .create(true)
                .append(true)
                .open(file_path)
                .map_err(|e| anyhow!("Failed to open file for appending: {}", e))?
        } else {
            OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(true)
                .open(file_path)
                .map_err(|e| anyhow!("Failed to create/open file: {}", e))?
        };

        let mut writer = Writer::from_writer(file);

        // Write headers if needed
        if write_headers {
            writer.write_record(&[
                "Timestamp",
                "OriginalText",
                "CorrectedText",
                "GrammarErrorCount",
                "OCREngine",
                "OCRConfidence",
                "ProcessingTime",
                "SourceType",
                "ErrorSummary",
            ])?;
        }

        // Write all records
        for record in records {
            let clean_original = Self::clean_text_for_csv(&record.original_text, opts.max_text_length);
            let clean_corrected = Self::clean_text_for_csv(&record.corrected_text, opts.max_text_length);
            let clean_error_summary = Self::clean_text_for_csv(&record.error_summary, opts.max_text_length);

            writer.write_record(&[
                &record.timestamp,
                &clean_original,
                &clean_corrected,
                &record.grammar_error_count.to_string(),
                &record.ocr_engine,
                &format!("{:.3}", record.ocr_confidence),
                &format!("{:.2}", record.processing_time),
                &record.source_type,
                &clean_error_summary,
            ])?;
        }

        writer.flush()?;
        
        log::info!("Successfully exported {} records to {}", records.len(), file_path);
        Ok(())
    }

    pub fn read_csv_file(file_path: &str) -> Result<Vec<ExportRecord>> {
        if !Path::new(file_path).exists() {
            return Err(anyhow!("CSV file does not exist: {}", file_path));
        }

        let mut reader = csv::Reader::from_path(file_path)
            .map_err(|e| anyhow!("Failed to open CSV file: {}", e))?;

        let mut records = Vec::new();

        for result in reader.deserialize() {
            match result {
                Ok(record) => {
                    let export_record: ExportRecord = record;
                    records.push(export_record);
                }
                Err(e) => {
                    log::warn!("Failed to parse CSV record: {}", e);
                    continue;
                }
            }
        }

        log::info!("Successfully read {} records from {}", records.len(), file_path);
        Ok(records)
    }

    pub fn get_export_statistics(file_path: &str) -> Result<ExportStatistics> {
        if !Path::new(file_path).exists() {
            return Err(anyhow!("CSV file does not exist: {}", file_path));
        }

        let records = Self::read_csv_file(file_path)?;
        
        if records.is_empty() {
            return Ok(ExportStatistics {
                total_records: 0,
                total_grammar_errors: 0,
                first_export: "N/A".to_string(),
                last_export: "N/A".to_string(),
                ocr_engines_used: std::collections::HashMap::new(),
                file_size_mb: 0.0,
            });
        }

        let total_records = records.len();
        let total_grammar_errors = records.iter().map(|r| r.grammar_error_count).sum();
        
        let timestamps: Vec<&String> = records.iter().map(|r| &r.timestamp).collect();
        let first_export = timestamps.iter().min().unwrap_or(&&"N/A".to_string()).to_string();
        let last_export = timestamps.iter().max().unwrap_or(&&"N/A".to_string()).to_string();

        let mut ocr_engines_used = std::collections::HashMap::new();
        for record in &records {
            *ocr_engines_used.entry(record.ocr_engine.clone()).or_insert(0) += 1;
        }

        let file_size_mb = std::fs::metadata(file_path)
            .map(|m| m.len() as f64 / (1024.0 * 1024.0))
            .unwrap_or(0.0);

        Ok(ExportStatistics {
            total_records,
            total_grammar_errors,
            first_export,
            last_export,
            ocr_engines_used,
            file_size_mb,
        })
    }

    pub fn create_backup(file_path: &str) -> Result<String> {
        if !Path::new(file_path).exists() {
            return Err(anyhow!("File does not exist: {}", file_path));
        }

        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
        let backup_path = format!("{}.backup_{}", file_path, timestamp);

        std::fs::copy(file_path, &backup_path)
            .map_err(|e| anyhow!("Failed to create backup: {}", e))?;

        log::info!("Created backup: {}", backup_path);
        Ok(backup_path)
    }

    fn clean_text_for_csv(text: &str, max_length: usize) -> String {
        if text.is_empty() {
            return String::new();
        }

        // Replace newlines and tabs with spaces
        let cleaned = text
            .replace('\n', " ")
            .replace('\r', " ")
            .replace('\t', " ");

        // Remove multiple spaces
        let cleaned = cleaned
            .split_whitespace()
            .collect::<Vec<&str>>()
            .join(" ");

        // Truncate if too long
        if cleaned.len() > max_length {
            format!("{}...", &cleaned[..max_length])
        } else {
            cleaned
        }
    }

    pub fn validate_export_data(record: &ExportRecord) -> Result<()> {
        if record.original_text.is_empty() && record.corrected_text.is_empty() {
            return Err(anyhow!("Both original and corrected text cannot be empty"));
        }

        if record.timestamp.is_empty() {
            return Err(anyhow!("Timestamp cannot be empty"));
        }

        if record.ocr_confidence < 0.0 || record.ocr_confidence > 1.0 {
            return Err(anyhow!("OCR confidence must be between 0.0 and 1.0"));
        }

        if record.processing_time < 0.0 {
            return Err(anyhow!("Processing time cannot be negative"));
        }

        Ok(())
    }
}
