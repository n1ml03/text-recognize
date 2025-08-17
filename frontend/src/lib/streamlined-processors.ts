import type { FileInfo } from './tauri-api';
import { universalFileApi } from './universal-file-api';

// Type definitions for better type safety
export interface WordDetail {
  text: string;
  confidence: number;
  bbox?: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

export interface GrammarError {
  message: string;
  rule_id: string;
  category: string;
  offset: number;
  length: number;
  context: string;
  suggestions: string[];
  severity: 'error' | 'warning' | 'info';
  confidence: number;
  error_type: 'spelling' | 'grammar' | 'punctuation' | 'style' | 'redundancy' | 'clarity' | 'other';
}

// Streamlined processing result interfaces
export interface StreamlinedProcessingResult {
  text: string;
  confidence?: number;
  engine_used: string;
  processing_time: number;
  word_details?: WordDetail[];
}

export interface StreamlinedGrammarResult {
  original_text: string;
  corrected_text: string;
  errors: GrammarError[];
  processing_time: number;
  error_count: number;
}

export interface StreamlinedLanguageStats {
  words: number;
  characters: number;
  characters_no_spaces: number;
  sentences: number;
  paragraphs: number;
  reading_time_minutes: number;
}

// OCR processing options
export interface OCROptions {
  enhance_contrast?: boolean;
  denoise?: boolean;
  threshold_method?: string;
  apply_morphology?: boolean;
}

// Constants for optimization
const OCR_CONFIG = {
  WORKER_TIMEOUT: 30000, // 30 seconds
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  VIDEO_FRAME_TIME: 1, // Extract frame at 1 second
  READING_SPEED_WPM: 200, // Words per minute for reading time calculation
} as const;

// Unified OneOCR processor (for both web and desktop via Python backend)
export class StreamlinedWebOCR {
  private static isInitialized = false;

  static async initialize(): Promise<void> {
    if (this.isInitialized) return;

    await this.checkBackendAvailability();
    this.isInitialized = true;
    console.log('OneOCR processor initialized');
  }

  private static async checkBackendAvailability(): Promise<void> {
    try {
      const backendUrl = this.getOneOCRBackendUrl();
      console.log(`Checking OneOCR backend availability at: ${backendUrl}`);

      const response = await fetch(`${backendUrl}/health`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Backend health check failed: ${response.status}`);
      }

      const healthData = await response.json();
      console.log('OneOCR backend is available:', healthData);
    } catch (error) {
      console.warn('OneOCR backend availability check failed:', error);
      // Don't throw error here - we'll handle it during actual processing
      // This allows the app to start even if backend is temporarily unavailable
    }
  }

  static async processFile(file: File): Promise<StreamlinedProcessingResult> {
    const startTime = Date.now();

    // Validate file size
    if (file.size > OCR_CONFIG.MAX_FILE_SIZE) {
      throw new Error(`File size exceeds maximum allowed size`);
    }

    // Handle text files directly
    if (file.type === 'text/plain') {
      const text = await file.text();
      return {
        text,
        engine_used: 'Text File Reader',
        processing_time: Date.now() - startTime,
        confidence: 1.0,
        word_details: this.generateWordDetailsFromText(text),
      };
    }

    await this.initialize();
    return await this.processFileViaHTTP(file, startTime);
  }

  private static async processFileViaHTTP(file: File, startTime: number): Promise<StreamlinedProcessingResult> {
    const backendUrl = this.getOneOCRBackendUrl();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('enhance_contrast', 'true');
    formData.append('denoise', 'true');
    formData.append('threshold_method', 'adaptive_gaussian');
    formData.append('apply_morphology', 'true');
    formData.append('deskew', 'true');
    formData.append('upscale', 'true');

    const response = await fetch(`${backendUrl}/ocr/image`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OneOCR backend error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    return {
      text: result.text || '',
      engine_used: result.engine_used || 'OneOCR',
      processing_time: Date.now() - startTime,
      confidence: result.confidence || 0,
      word_details: this.convertWordDetails(result.word_details || []),
    };
  }

  private static getOneOCRBackendUrl(): string {
    if (typeof window !== 'undefined') {
      const storedUrl = localStorage.getItem('oneocr_backend_url');
      if (storedUrl) return storedUrl;
    }

    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ONEOCR_BACKEND_URL) {
      return import.meta.env.VITE_ONEOCR_BACKEND_URL;
    }

    return 'http://localhost:8000';
  }

  static setBackendUrl(url: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('oneocr_backend_url', url);
    }
  }

  static getBackendUrl(): string {
    return this.getOneOCRBackendUrl();
  }

  static async testBackendConnection(): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const backendUrl = this.getOneOCRBackendUrl();
      const response = await fetch(`${backendUrl}/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        return {
          success: false,
          message: `Backend responded with status ${response.status}`
        };
      }

      const data = await response.json();
      return {
        success: true,
        message: 'Successfully connected to OneOCR backend',
        data
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to connect to OneOCR backend: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private static convertWordDetails(pythonWordDetails: any[]): WordDetail[] {
    return pythonWordDetails.map(word => ({
      text: word.text || '',
      confidence: word.confidence || 0,
      bbox: {
        x0: word.bbox?.x || 0,
        y0: word.bbox?.y || 0,
        x1: (word.bbox?.x || 0) + (word.bbox?.width || 0),
        y1: (word.bbox?.y || 0) + (word.bbox?.height || 0),
      },
    }));
  }

  private static generateWordDetailsFromText(text: string): WordDetail[] {
    const words = text.trim().split(/\s+/).filter(word => word.length > 0);
    return words.map((word, index) => ({
      text: word,
      confidence: 1.0,
      bbox: {
        x0: index * 50, // Mock positioning
        y0: 10,
        x1: (index + 1) * 50,
        y1: 30,
      },
    }));
  }

  static async cleanup(): Promise<void> {
    try {
      this.isInitialized = false;
      console.log('OneOCR web processor cleaned up');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}

// Streamlined LanguageTool grammar processor
export class StreamlinedGrammarProcessor {
  private static readonly LANGUAGE_TOOL_API = 'https://api.languagetool.org/v2/check';
  private static readonly REQUEST_TIMEOUT = 15000; // 15 seconds
  private static readonly MAX_TEXT_LENGTH = 20000; // LanguageTool limit

  static async checkText(text: string, language: string = 'en-US', autoCorrect: boolean = false): Promise<StreamlinedGrammarResult> {
    const startTime = Date.now();

    try {
      // Validate input
      if (!text.trim()) {
        return this.createEmptyResult(text, Date.now() - startTime);
      }

      // Truncate text if too long
      const processedText = text.length > this.MAX_TEXT_LENGTH
        ? text.substring(0, this.MAX_TEXT_LENGTH) + '...'
        : text;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);

      try {
        const response = await fetch(this.LANGUAGE_TOOL_API, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
          },
          body: new URLSearchParams({
            text: processedText,
            language,
            enabledOnly: 'false',
            level: 'picky',
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`LanguageTool API error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        const processingTime = Date.now() - startTime;

        // Enhanced error processing with validation
        const errors = this.processMatches(result.matches || []);

        // Smart auto-correction logic
        let correctedText = text;
        if (autoCorrect && errors.length > 0) {
          correctedText = this.applySmartCorrections(text, errors);
        }

        return {
          original_text: text,
          corrected_text: correctedText,
          errors,
          processing_time: processingTime,
          error_count: errors.length,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Grammar check timed out. Please try with shorter text.');
      }
      throw new Error(`Grammar check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private static createEmptyResult(text: string, processingTime: number): StreamlinedGrammarResult {
    return {
      original_text: text,
      corrected_text: text,
      errors: [],
      processing_time: processingTime,
      error_count: 0,
    };
  }

  private static processMatches(matches: any[]): GrammarError[] {
    return matches
      .filter(match => this.isValidMatch(match))
      .map(error => {
        const suggestions = (error.replacements || [])
          .map((r: any) => r.value)
          .filter((s: string) => s && typeof s === 'string' && s.length <= 100)
          .slice(0, 5);

        return {
          message: String(error.message || 'Grammar issue detected'),
          rule_id: String(error.rule?.id || 'unknown'),
          category: String(error.rule?.category?.name || 'Grammar'),
          offset: Math.max(0, Number(error.offset) || 0),
          length: Math.max(1, Number(error.length) || 1),
          context: String(error.context?.text || ''),
          suggestions,
          severity: this.mapSeverity(error.rule?.issueType || 'suggestion'),
          confidence: this.calculateConfidence(error),
          error_type: this.categorizeErrorType(error.rule?.category?.id),
        } as GrammarError;
      })
      .slice(0, 100); // Limit to 100 errors for performance
  }

  private static isValidMatch(match: any): boolean {
    return (
      match &&
      typeof match.message === 'string' &&
      typeof match.offset === 'number' &&
      typeof match.length === 'number' &&
      match.offset >= 0 &&
      match.length > 0
    );
  }

  private static applySmartCorrections(text: string, errors: GrammarError[]): string {
    if (!errors.length) return text;

    let corrected = text;

    // Filter for high-confidence, safe corrections
    const safeErrors = errors.filter(error => {
      const isSafe = ['spelling', 'punctuation'].includes(error.error_type) &&
                     error.confidence >= 0.8 &&
                     error.severity === 'error' &&
                     error.suggestions.length > 0 &&
                     error.suggestions[0].length <= error.length * 3; // Avoid overly long replacements
      return isSafe;
    });

    // Sort by offset descending to avoid position shifts
    const sortedErrors = [...safeErrors].sort((a, b) => b.offset - a.offset);

    for (const error of sortedErrors) {
      const suggestion = error.suggestions[0];
      const startPos = error.offset;
      const endPos = startPos + error.length;

      // Validate bounds
      if (startPos >= 0 && endPos <= corrected.length && startPos < endPos) {
        corrected = corrected.substring(0, startPos) +
                   suggestion +
                   corrected.substring(endPos);
      }
    }

    return corrected;
  }

  private static calculateConfidence(error: any): number {
    // Enhanced confidence calculation based on multiple factors
    let confidence = 0.7; // Base confidence

    // Higher confidence for specific rule types
    const ruleId = String(error.rule?.id || '').toLowerCase();
    if (ruleId.includes('speller') || ruleId.includes('spelling')) {
      confidence = 0.9;
    } else if (ruleId.includes('typo')) {
      confidence = 0.85;
    } else if (ruleId.includes('punctuation')) {
      confidence = 0.8;
    }

    // Boost confidence if there's a clear single suggestion
    const replacements = error.replacements || [];
    if (replacements.length === 1) {
      confidence += 0.1;
    }

    // Reduce confidence for long replacements (likely style suggestions)
    const firstReplacement = replacements[0];
    if (firstReplacement?.value && firstReplacement.value.length > (error.length || 1) * 2) {
      confidence -= 0.2;
    }

    return Math.min(Math.max(confidence, 0.1), 1.0);
  }

  private static categorizeErrorType(categoryId: string = ''): GrammarError['error_type'] {
    const category = String(categoryId).toLowerCase();
    if (category.includes('typo') || category.includes('speller')) return 'spelling';
    if (category.includes('grammar')) return 'grammar';
    if (category.includes('punctuation')) return 'punctuation';
    if (category.includes('style')) return 'style';
    if (category.includes('redundancy')) return 'redundancy';
    if (category.includes('clarity')) return 'clarity';
    return 'other';
  }

  private static mapSeverity(issueType: string): GrammarError['severity'] {
    const type = String(issueType).toLowerCase();
    switch (type) {
      case 'misspelling':
      case 'grammar':
        return 'error';
      case 'style':
        return 'warning';
      default:
        return 'info';
    }
  }
  
  static getLanguageStatistics(text: string): StreamlinedLanguageStats {
    if (!text || typeof text !== 'string') {
      return {
        words: 0,
        characters: 0,
        characters_no_spaces: 0,
        sentences: 0,
        paragraphs: 0,
        reading_time_minutes: 0,
      };
    }

    // Optimized calculations
    const trimmedText = text.trim();
    const words = trimmedText ? trimmedText.split(/\s+/).filter(word => word.length > 0).length : 0;
    const characters = text.length;
    const charactersNoSpaces = text.replace(/\s/g, '').length;

    // More accurate sentence detection
    const sentences = trimmedText
      ? trimmedText.split(/[.!?]+/).filter(s => s.trim().length > 0).length
      : 0;

    // Better paragraph detection
    const paragraphs = trimmedText
      ? Math.max(1, trimmedText.split(/\n\s*\n/).filter(p => p.trim().length > 0).length)
      : 0;

    // Reading time based on average reading speed (200 WPM)
    const readingTimeMinutes = words > 0 ? Math.max(1, Math.ceil(words / OCR_CONFIG.READING_SPEED_WPM)) : 0;

    return {
      words,
      characters,
      characters_no_spaces: charactersNoSpaces,
      sentences,
      paragraphs,
      reading_time_minutes: readingTimeMinutes,
    };
  }
}

// Import Tauri types for compatibility
import type { WordDetail as TauriWordDetail, BoundingBox } from './tauri-api';

// Type adapters for compatibility between Tauri and web interfaces
class TypeAdapters {
  static adaptWordDetails(tauriWordDetails: any[]): WordDetail[] {
    return tauriWordDetails.map(word => ({
      text: word.text,
      confidence: word.confidence,
      bbox: word.bbox ? {
        x0: word.bbox.x,
        y0: word.bbox.y,
        x1: word.bbox.x + word.bbox.width,
        y1: word.bbox.y + word.bbox.height,
      } : undefined,
    }));
  }

  static adaptWordDetailsToTauri(webWordDetails: WordDetail[]): TauriWordDetail[] {
    return webWordDetails.map(word => ({
      text: word.text,
      confidence: word.confidence,
      bbox: word.bbox ? {
        x: word.bbox.x0,
        y: word.bbox.y0,
        width: word.bbox.x1 - word.bbox.x0,
        height: word.bbox.y1 - word.bbox.y0,
      } as BoundingBox : {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      } as BoundingBox,
    }));
  }

  static adaptGrammarErrors(tauriErrors: any[]): GrammarError[] {
    return tauriErrors.map(error => ({
      message: error.message,
      rule_id: error.rule_id,
      category: error.category,
      offset: error.offset,
      length: error.length,
      context: error.context,
      suggestions: error.suggestions,
      severity: this.normalizeSeverity(error.severity),
      confidence: error.confidence,
      error_type: error.error_type,
    }));
  }

  private static normalizeSeverity(severity: string): 'error' | 'warning' | 'info' {
    const normalized = severity.toLowerCase();
    if (normalized === 'error') return 'error';
    if (normalized === 'warning') return 'warning';
    return 'info';
  }
}

// Main streamlined processor
export class StreamlinedProcessor {
  static async processFile(fileInfo: FileInfo, _options?: {
    ocr_options?: OCROptions;
  }): Promise<StreamlinedProcessingResult> {
    // Always use unified HTTP approach to Python backend for both web and desktop
    if (universalFileApi.isTauriEnvironment()) {
      // For Tauri environment, we need to convert the file path to a File object
      // or handle it differently since we need to send it via HTTP
      throw new Error('Tauri file processing via HTTP not yet implemented. Use StreamlinedWebOCR.processFile with File object instead.');
    } else {
      // Use streamlined web processing
      const webFile = (fileInfo as any).webFile;
      if (!webFile) {
        throw new Error('File not available for processing in web environment');
      }

      return await StreamlinedWebOCR.processFile(webFile);
    }
  }

  static async checkGrammar(text: string, autoCorrect: boolean = false, smartMode: boolean = true): Promise<StreamlinedGrammarResult> {
    if (universalFileApi.isTauriEnvironment()) {
      // Use enhanced Tauri grammar API
      const { grammarApi } = await import('./tauri-api');
      const result = smartMode
        ? await grammarApi.smartGrammarCheck(text)
        : await grammarApi.checkText(text, autoCorrect);

      // Adapt the result to match our interface
      return {
        original_text: result.original_text,
        corrected_text: result.corrected_text,
        errors: TypeAdapters.adaptGrammarErrors(result.errors || []),
        processing_time: result.processing_time,
        error_count: result.error_count,
      };
    } else {
      // Use enhanced web grammar checking
      return await StreamlinedGrammarProcessor.checkText(text, 'en-US', autoCorrect || smartMode);
    }
  }

  static async applySelectiveCorrections(text: string, correctionTypes: string[]): Promise<string> {
    if (!text || !correctionTypes.length) {
      return text;
    }

    if (universalFileApi.isTauriEnvironment()) {
      const { grammarApi } = await import('./tauri-api');
      return await grammarApi.applySelectiveCorrections(text, correctionTypes);
    } else {
      // Web implementation of selective corrections
      const result = await StreamlinedGrammarProcessor.checkText(text, 'en-US', false);
      const filteredErrors = result.errors.filter(error =>
        correctionTypes.includes(error.error_type)
      );

      return this.applySpecificCorrections(text, filteredErrors);
    }
  }

  private static applySpecificCorrections(text: string, errors: GrammarError[]): string {
    if (!errors.length) return text;

    let corrected = text;

    // Sort by offset descending to avoid position shifts
    const sortedErrors = [...errors]
      .filter(error => error.suggestions.length > 0)
      .sort((a, b) => b.offset - a.offset);

    for (const error of sortedErrors) {
      const suggestion = error.suggestions[0];
      const startPos = error.offset;
      const endPos = startPos + error.length;

      // Validate bounds and apply correction
      if (startPos >= 0 && endPos <= corrected.length && startPos < endPos) {
        corrected = corrected.substring(0, startPos) +
                   suggestion +
                   corrected.substring(endPos);
      }
    }

    return corrected;
  }

  static async getLanguageStatistics(text: string): Promise<StreamlinedLanguageStats> {
    if (universalFileApi.isTauriEnvironment()) {
      // Use Tauri language statistics
      const { grammarApi } = await import('./tauri-api');
      return await grammarApi.getLanguageStatistics(text);
    } else {
      // Use streamlined web language statistics
      return StreamlinedGrammarProcessor.getLanguageStatistics(text);
    }
  }

  static async cleanup(): Promise<void> {
    if (universalFileApi.isWebEnvironment()) {
      await StreamlinedWebOCR.cleanup();
    }
  }
}

// Export streamlined processor instance with enhanced compatibility
export const streamlinedProcessor = {
  processFile: StreamlinedProcessor.processFile.bind(StreamlinedProcessor),
  checkGrammar: StreamlinedProcessor.checkGrammar.bind(StreamlinedProcessor),
  applySelectiveCorrections: StreamlinedProcessor.applySelectiveCorrections.bind(StreamlinedProcessor),
  getLanguageStatistics: StreamlinedProcessor.getLanguageStatistics.bind(StreamlinedProcessor),
  cleanup: StreamlinedProcessor.cleanup.bind(StreamlinedProcessor),

  // Enhanced method that returns Tauri-compatible format for UI components
  async processFileForUI(fileInfo: FileInfo, options?: { ocr_options?: OCROptions }) {
    const result = await StreamlinedProcessor.processFile(fileInfo, options);

    // Convert to Tauri-compatible format for UI components
    return {
      text: result.text,
      confidence: result.confidence || 0,
      engine_used: result.engine_used,
      processing_time: result.processing_time,
      word_details: TypeAdapters.adaptWordDetailsToTauri(result.word_details || []),
    };
  },

  // Utility methods for OneOCR backend management
  testBackendConnection: StreamlinedWebOCR.testBackendConnection.bind(StreamlinedWebOCR),
  setBackendUrl: StreamlinedWebOCR.setBackendUrl.bind(StreamlinedWebOCR),
  getBackendUrl: StreamlinedWebOCR.getBackendUrl.bind(StreamlinedWebOCR),
};

// Make utilities available globally for debugging
if (typeof window !== 'undefined') {
  (window as any).oneOCRUtils = {
    testConnection: StreamlinedWebOCR.testBackendConnection.bind(StreamlinedWebOCR),
    setBackendUrl: StreamlinedWebOCR.setBackendUrl.bind(StreamlinedWebOCR),
    getBackendUrl: StreamlinedWebOCR.getBackendUrl.bind(StreamlinedWebOCR),
  };
}
