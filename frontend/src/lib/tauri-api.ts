import { invoke } from '@tauri-apps/api/core';

// Helper function to check if Tauri is available
function isTauriAvailable(): boolean {
  return typeof window !== 'undefined' && window.__TAURI__ !== undefined;
}

// Safe invoke wrapper that handles Tauri availability
async function safeInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriAvailable()) {
    // Fallback to web-based implementations for common commands
    return await webFallback<T>(command, args);
  }

  try {
    return await invoke<T>(command, args);
  } catch (error) {
    console.error(`Failed to invoke Tauri command '${command}':`, error);
    throw error;
  }
}

// Web fallback implementations for when Tauri is not available
async function webFallback<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  switch (command) {
    case 'get_supported_image_formats':
      return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] as T;

    case 'get_all_supported_formats':
      return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] as T;

    case 'validate_image_file':
      // Basic validation for web environment
      return true as T;

    case 'get_language_statistics':
      const text = args?.text as string || '';
      const words = text.split(/\s+/).filter(word => word.length > 0).length;
      const characters = text.length;
      const charactersNoSpaces = text.replace(/\s/g, '').length;
      const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
      const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0).length;
      const readingTimeMinutes = Math.ceil(words / 200); // Average reading speed

      return {
        words,
        characters,
        characters_no_spaces: charactersNoSpaces,
        sentences,
        paragraphs,
        reading_time_minutes: readingTimeMinutes
      } as T;

    default:
      throw new Error(`Web fallback not implemented for command: ${command}. This feature requires the desktop version of the application.`);
  }
}

// Types for API responses
export interface OCRResult {
  text: string;
  confidence: number;
  engine_used: string;
  processing_time: number;
  word_details: WordDetail[];
}

export interface WordDetail {
  text: string;
  confidence: number;
  bbox: BoundingBox;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PreprocessingOptions {
  enhance_contrast: boolean;
  denoise: boolean;
  threshold_method: string;
  apply_morphology: boolean;
}

export interface GrammarCheckResult {
  original_text: string;
  corrected_text: string;
  errors: GrammarError[];
  processing_time: number;
  error_count: number;
}

export interface GrammarError {
  message: string;
  rule_id: string;
  category: string;
  offset: number;
  length: number;
  context: string;
  suggestions: string[];
  severity: string;
  confidence?: number;
  error_type?: string;
}

export interface LanguageStats {
  words: number;
  characters: number;
  characters_no_spaces: number;
  sentences: number;
  paragraphs: number;
  reading_time_minutes: number;
}

export interface FileInfo {
  path: string;
  name: string;
  size: number;
  extension: string;
  file_type: 'Image' | 'Video' | 'Document' | 'Pdf' | 'Unknown';
  last_modified: string;
}

export interface ExportRecord {
  timestamp: string;
  original_text: string;
  corrected_text: string;
  grammar_error_count: number;
  ocr_engine: string;
  ocr_confidence: number;
  processing_time: number;
  source_type: string;
  error_summary: string;
}

export interface ExportOptions {
  append_mode: boolean;
  include_headers: boolean;
  max_text_length: number;
}

export interface ExportStatistics {
  total_records: number;
  total_grammar_errors: number;
  first_export: string;
  last_export: string;
  ocr_engines_used: Record<string, number>;
  file_size_mb: number;
}

// OCR API functions
export const ocrApi = {
  processImage: async (filePath: string, options?: PreprocessingOptions): Promise<OCRResult> => {
    return safeInvoke('process_image_ocr', { file_path: filePath, preprocessing_options: options });
  },

  validateImageFile: async (filePath: string): Promise<boolean> => {
    return safeInvoke('validate_image_file', { filePath });
  },

  getSupportedImageFormats: async (): Promise<string[]> => {
    return safeInvoke('get_supported_image_formats');
  },

  extractVideoFrames: async (videoPath: string, outputDir: string, frameInterval?: number): Promise<string[]> => {
    return safeInvoke('extract_video_frames', { videoPath, outputDir, frameInterval });
  },
};

// Grammar API functions
export const grammarApi = {
  checkText: async (text: string, autoCorrect: boolean = false): Promise<GrammarCheckResult> => {
    return safeInvoke('check_grammar', { text, autoCorrect });
  },

  smartGrammarCheck: async (text: string): Promise<GrammarCheckResult> => {
    return safeInvoke('smart_grammar_check', { text });
  },

  applySpecificCorrections: async (text: string, errorIndices: number[]): Promise<string> => {
    return safeInvoke('apply_specific_corrections', { text, errorIndices });
  },

  applySelectiveCorrections: async (text: string, correctionTypes: string[]): Promise<string> => {
    return safeInvoke('apply_selective_corrections', { text, correctionTypes });
  },

  getLanguageStatistics: async (text: string): Promise<LanguageStats> => {
    return safeInvoke('get_language_statistics', { text });
  },

  setGrammarServerUrl: async (serverUrl: string): Promise<void> => {
    return safeInvoke('set_grammar_server_url', { serverUrl });
  },

  getGrammarProviders: async (): Promise<string[]> => {
    return safeInvoke('get_grammar_providers');
  },

  getSupportedLanguages: async (): Promise<string[]> => {
    return safeInvoke('get_supported_languages');
  },
};

// File API functions
export const fileApi = {
  getFileInfo: async (filePath: string): Promise<FileInfo> => {
    return safeInvoke('get_file_info', { file_path: filePath });
  },

  validateFilePath: async (filePath: string): Promise<boolean> => {
    return safeInvoke('validate_file_path', { file_path: filePath });
  },

  isSupportedImage: async (filePath: string): Promise<boolean> => {
    return safeInvoke('is_supported_image', { file_path: filePath });
  },

  isSupportedVideo: async (filePath: string): Promise<boolean> => {
    return safeInvoke('is_supported_video', { file_path: filePath });
  },

  isSupportedDocument: async (filePath: string): Promise<boolean> => {
    return safeInvoke('is_supported_document', { file_path: filePath });
  },

  isSupportedPdf: async (filePath: string): Promise<boolean> => {
    return safeInvoke('is_supported_pdf', { file_path: filePath });
  },

  getSupportedFormats: async (): Promise<[string[], string[], string[], string[]]> => {
    return safeInvoke('get_supported_formats');
  },

  getAllSupportedFormats: async (): Promise<string[]> => {
    return safeInvoke('get_all_supported_formats');
  },

  extractTextFromDocument: async (filePath: string): Promise<string> => {
    return safeInvoke('extract_text_from_document', { file_path: filePath });
  },

  extractTextFromPdf: async (filePath: string): Promise<string> => {
    return safeInvoke('extract_text_from_pdf', { file_path: filePath });
  },

  extractFramesFromVideo: async (videoPath: string, outputDir: string, frameInterval?: number): Promise<string[]> => {
    return safeInvoke('extract_frames_from_video', {
      video_path: videoPath,
      output_dir: outputDir,
      frame_interval: frameInterval
    });
  },

  formatFileSize: async (sizeBytes: number): Promise<string> => {
    return safeInvoke('format_file_size', { size_bytes: sizeBytes });
  },

  createBackupPath: async (originalPath: string): Promise<string> => {
    return safeInvoke('create_backup_path', { original_path: originalPath });
  },

  ensureDirectoryExists: async (dirPath: string): Promise<void> => {
    return safeInvoke('ensure_directory_exists', { dir_path: dirPath });
  },

  cleanupTempFiles: async (tempDir: string): Promise<void> => {
    return safeInvoke('cleanup_temp_files', { temp_dir: tempDir });
  },
};

// Export API functions
export const exportApi = {
  exportToCsv: async (filePath: string, record: ExportRecord, options?: ExportOptions): Promise<void> => {
    return safeInvoke('export_to_csv', { filePath, record, options });
  },

  exportMultipleToCsv: async (filePath: string, records: ExportRecord[], options?: ExportOptions): Promise<void> => {
    return safeInvoke('export_multiple_to_csv', { filePath, records, options });
  },

  readCsvFile: async (filePath: string): Promise<ExportRecord[]> => {
    return safeInvoke('read_csv_file', { filePath });
  },

  getCsvStatistics: async (filePath: string): Promise<ExportStatistics> => {
    return safeInvoke('get_csv_statistics', { filePath });
  },

  createCsvBackup: async (filePath: string): Promise<string> => {
    return safeInvoke('create_csv_backup', { filePath });
  },

  validateExportRecord: async (record: ExportRecord): Promise<boolean> => {
    return safeInvoke('validate_export_record', { record });
  },

  createExportRecord: async (
    originalText: string,
    correctedText: string,
    grammarErrorCount: number,
    ocrEngine: string,
    ocrConfidence: number,
    processingTime: number,
    sourceType: string,
    errorSummary: string
  ): Promise<ExportRecord> => {
    return safeInvoke('create_export_record', {
      originalText,
      correctedText,
      grammarErrorCount,
      ocrEngine,
      ocrConfidence,
      processingTime,
      sourceType,
      errorSummary,
    });
  },
};

// Batch processing interfaces
export interface BatchProcessingResult {
  file_path: string;
  success: boolean;
  original_text: string;
  corrected_text: string;
  grammar_error_count: number;
  ocr_confidence: number;
  processing_time: number;
  error_message?: string;
}

export interface BatchProgress {
  is_processing: boolean;
  current_file_index: number;
  total_files: number;
  completed_files: number;
  failed_files: number;
  elapsed_time_seconds: number;
  estimated_remaining_seconds: number;
  current_file_path: string;
}

// Batch API functions
export const batchApi = {
  processFiles: async (filePaths: string[], autoCorrect: boolean = false): Promise<BatchProcessingResult[]> => {
    return safeInvoke('batch_process_files', { filePaths, autoCorrect });
  },

  getProgress: async (): Promise<BatchProgress> => {
    return safeInvoke('get_batch_progress');
  },

  cancelProcessing: async (): Promise<void> => {
    return safeInvoke('cancel_batch_processing');
  },

  exportResults: async (results: BatchProcessingResult[], exportPath: string, includeFailed: boolean = false): Promise<string> => {
    return safeInvoke('batch_export_results', { results, exportPath, includeFailed });
  },

  getStatistics: async (results: BatchProcessingResult[]): Promise<any> => {
    return safeInvoke('get_batch_statistics', { results });
  },
};
