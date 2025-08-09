import type { FileInfo } from './tauri-api';
import { universalFileApi } from './universal-file-api';

// Streamlined processing result interface
export interface StreamlinedProcessingResult {
  text: string;
  confidence?: number;
  engine_used: string;
  processing_time: number;
  word_details?: any[];
}

export interface StreamlinedGrammarResult {
  original_text: string;
  corrected_text: string;
  errors: any[];
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

// Streamlined Tesseract OCR processor (for web environment)
export class StreamlinedWebOCR {
  private static worker: any = null;
  private static isInitialized = false;

  static async initialize(): Promise<void> {
    if (this.isInitialized && this.worker) {
      return;
    }

    try {
      const Tesseract = await import('tesseract.js');
      
      this.worker = await Tesseract.createWorker('eng', 1, {
        logger: (m: any) => console.log('OCR:', m.status, Math.round(m.progress * 100) + '%'),
      });
      
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize Tesseract.js:', error);
      throw new Error('OCR initialization failed');
    }
  }

  static async processFile(file: File): Promise<StreamlinedProcessingResult> {
    const startTime = Date.now();
    
    try {
      await this.initialize();
      
      // For all file types, convert to image first if needed
      let imageData: string;
      
      if (file.type.startsWith('image/')) {
        // Direct image processing
        imageData = await this.fileToDataURL(file);
      } else if (file.type === 'application/pdf') {
        // Convert PDF to image using canvas
        imageData = await this.convertPdfToImage(file);
      } else if (file.type.includes('document') || file.name.endsWith('.docx')) {
        // For documents, we'll try to extract text directly first
        try {
          const text = await this.extractDocumentText(file);
          return {
            text,
            engine_used: 'Direct Text Extraction',
            processing_time: Date.now() - startTime,
            confidence: 1.0,
          };
        } catch {
          // Fallback to OCR if direct extraction fails
          throw new Error('Document processing not available, please use image format');
        }
      } else if (file.type.startsWith('video/')) {
        // Extract frame from video
        imageData = await this.extractVideoFrame(file);
      } else {
        throw new Error(`Unsupported file type: ${file.type}`);
      }
      
      // Process with Tesseract
      const result = await this.worker.recognize(imageData);
      
      return {
        text: result.data.text,
        confidence: result.data.confidence / 100,
        engine_used: 'Tesseract.js',
        processing_time: Date.now() - startTime,
        word_details: result.data.words || [],
      };
    } catch (error) {
      throw new Error(`OCR processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private static async fileToDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  private static async convertPdfToImage(_file: File): Promise<string> {
    try {
      // Simple PDF to image conversion for OCR
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not available');
      
      // This is a simplified approach - in reality, you'd need PDF.js
      // For now, we'll show an error for unsupported formats
      throw new Error('PDF processing requires additional setup. Please convert to image format.');
    } catch (error) {
      throw new Error('PDF to image conversion failed');
    }
  }

  private static async extractDocumentText(file: File): Promise<string> {
    if (file.name.endsWith('.txt')) {
      return await file.text();
    }
    throw new Error('Document text extraction not available in streamlined version');
  }

  private static async extractVideoFrame(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Canvas not available'));
        return;
      }
      
      video.onloadedmetadata = () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        video.currentTime = 1; // Get frame at 1 second
      };
      
      video.onseeked = () => {
        ctx.drawImage(video, 0, 0);
        const dataURL = canvas.toDataURL('image/png');
        URL.revokeObjectURL(video.src);
        resolve(dataURL);
      };
      
      video.onerror = () => reject(new Error('Video processing failed'));
      video.src = URL.createObjectURL(file);
      video.load();
    });
  }

  static async cleanup(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
    }
  }
}

// Streamlined LanguageTool grammar processor
export class StreamlinedGrammarProcessor {
  private static readonly LANGUAGE_TOOL_API = 'https://api.languagetool.org/v2/check';
  
  static async checkText(text: string, language: string = 'en-US', autoCorrect: boolean = false): Promise<StreamlinedGrammarResult> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(this.LANGUAGE_TOOL_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          text,
          language,
          enabledOnly: 'false',
          level: 'picky',
        }),
      });
      
      if (!response.ok) {
        throw new Error(`LanguageTool API error: ${response.status}`);
      }
      
      const result = await response.json();
      const processingTime = Date.now() - startTime;
      
      // Enhanced error processing
      const errors = (result.matches || []).map((error: any) => ({
        message: error.message,
        rule_id: error.rule?.id || '',
        category: error.rule?.category?.name || 'Grammar',
        offset: error.offset,
        length: error.length,
        context: error.context?.text || '',
        suggestions: error.replacements?.map((r: any) => r.value).slice(0, 5) || [],
        severity: this.mapSeverity(error.rule?.issueType || 'suggestion'),
        confidence: this.calculateConfidence(error),
        error_type: this.categorizeErrorType(error.rule?.category?.id),
      }));
      
      // Smart auto-correction logic
      let correctedText = text;
      if (autoCorrect) {
        correctedText = this.applySmartCorrections(text, errors);
      }
      
      return {
        original_text: text,
        corrected_text: correctedText,
        errors,
        processing_time: processingTime,
        error_count: errors.length,
      };
    } catch (error) {
      throw new Error(`Grammar check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private static applySmartCorrections(text: string, errors: any[]): string {
    let corrected = text;
    
    // Filter for high-confidence, safe corrections
    const safeErrors = errors.filter(error => {
      const isSafe = ['spelling', 'punctuation'].includes(error.error_type) && 
                     error.confidence >= 0.8 && 
                     error.severity === 'error';
      return isSafe && error.suggestions.length > 0;
    });
    
    // Sort by offset descending to avoid position shifts
    safeErrors.sort((a, b) => b.offset - a.offset);
    
    safeErrors.forEach(error => {
      const suggestion = error.suggestions[0];
      const startPos = error.offset;
      const endPos = startPos + error.length;
      
      if (endPos <= corrected.length) {
        corrected = corrected.substring(0, startPos) + 
                   suggestion + 
                   corrected.substring(endPos);
      }
    });
    
    return corrected;
  }

  private static calculateConfidence(error: any): number {
    // Enhanced confidence calculation based on multiple factors
    let confidence = 0.7; // Base confidence
    
    // Higher confidence for specific rule types
    const ruleId = error.rule?.id?.toLowerCase() || '';
    if (ruleId.includes('speller') || ruleId.includes('spelling')) {
      confidence = 0.9;
    } else if (ruleId.includes('typo')) {
      confidence = 0.85;
    } else if (ruleId.includes('punctuation')) {
      confidence = 0.8;
    }
    
    // Boost confidence if there's a clear single suggestion
    if (error.replacements && error.replacements.length === 1) {
      confidence += 0.1;
    }
    
    // Reduce confidence for long replacements (likely style suggestions)
    if (error.replacements && error.replacements[0]?.value.length > error.length * 2) {
      confidence -= 0.2;
    }
    
    return Math.min(Math.max(confidence, 0.1), 1.0);
  }

  private static categorizeErrorType(categoryId: string = ''): string {
    const category = categoryId.toLowerCase();
    if (category.includes('typo') || category.includes('speller')) return 'spelling';
    if (category.includes('grammar')) return 'grammar';
    if (category.includes('punctuation')) return 'punctuation';
    if (category.includes('style')) return 'style';
    if (category.includes('redundancy')) return 'redundancy';
    if (category.includes('clarity')) return 'clarity';
    return 'other';
  }
  
  private static mapSeverity(issueType: string): string {
    switch (issueType.toLowerCase()) {
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
    const words = text.trim().split(/\s+/).filter(word => word.length > 0).length;
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
      reading_time_minutes: readingTimeMinutes,
    };
  }
}

// Main streamlined processor
export class StreamlinedProcessor {
  static async processFile(fileInfo: FileInfo, options?: {
    ocr_options?: {
      enhance_contrast?: boolean;
      denoise?: boolean;
      threshold_method?: string;
      apply_morphology?: boolean;
    };
  }): Promise<StreamlinedProcessingResult> {
    if (universalFileApi.isTauriEnvironment()) {
      // Use Tauri OCR API (already optimized)
      const { ocrApi } = await import('./tauri-api');
      const defaultOptions = {
        enhance_contrast: true,
        denoise: true,
        threshold_method: 'adaptive_gaussian',
        apply_morphology: true,
      };
      
      const ocrOptions = options?.ocr_options ? {
        enhance_contrast: options.ocr_options.enhance_contrast ?? true,
        denoise: options.ocr_options.denoise ?? true,
        threshold_method: options.ocr_options.threshold_method ?? 'adaptive_gaussian',
        apply_morphology: options.ocr_options.apply_morphology ?? true,
      } : defaultOptions;
      
      const result = await ocrApi.processImage(fileInfo.path, ocrOptions);
      
      return {
        text: result.text,
        confidence: result.confidence,
        engine_used: result.engine_used,
        processing_time: result.processing_time,
        word_details: result.word_details,
      };
    } else {
      // Use streamlined web processing
      const webFile = (fileInfo as any).webFile as File;
      if (!webFile) {
        throw new Error('File not available for processing');
      }
      
      return await StreamlinedWebOCR.processFile(webFile);
    }
  }

  static async checkGrammar(text: string, autoCorrect: boolean = false, smartMode: boolean = true): Promise<StreamlinedGrammarResult> {
    if (universalFileApi.isTauriEnvironment()) {
      // Use enhanced Tauri grammar API
      const { grammarApi } = await import('./tauri-api');
      if (smartMode) {
        return await grammarApi.smartGrammarCheck(text);
      } else {
        return await grammarApi.checkText(text, autoCorrect);
      }
    } else {
      // Use enhanced web grammar checking
      return await StreamlinedGrammarProcessor.checkText(text, 'en-US', autoCorrect || smartMode);
    }
  }

  static async applySelectiveCorrections(text: string, correctionTypes: string[]): Promise<string> {
    if (universalFileApi.isTauriEnvironment()) {
      const { grammarApi } = await import('./tauri-api');
      return await grammarApi.applySelectiveCorrections(text, correctionTypes);
    } else {
      // Web implementation of selective corrections
      const result = await StreamlinedGrammarProcessor.checkText(text, 'en-US', false);
      const filteredErrors = result.errors.filter((error: any) => 
        correctionTypes.includes(error.error_type)
      );
      
      return StreamlinedProcessor.applySpecificCorrections(text, filteredErrors);
    }
  }

  private static applySpecificCorrections(text: string, errors: any[]): string {
    let corrected = text;
    
    // Sort by offset descending to avoid position shifts
    const sortedErrors = [...errors].sort((a, b) => b.offset - a.offset);
    
    sortedErrors.forEach(error => {
      if (error.suggestions && error.suggestions.length > 0) {
        const suggestion = error.suggestions[0];
        const startPos = error.offset;
        const endPos = startPos + error.length;
        
        if (endPos <= corrected.length) {
          corrected = corrected.substring(0, startPos) + 
                     suggestion + 
                     corrected.substring(endPos);
        }
      }
    });
    
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

// Export streamlined processor instance
export const streamlinedProcessor = {
  processFile: StreamlinedProcessor.processFile.bind(StreamlinedProcessor),
  checkGrammar: StreamlinedProcessor.checkGrammar.bind(StreamlinedProcessor),
  applySelectiveCorrections: StreamlinedProcessor.applySelectiveCorrections.bind(StreamlinedProcessor),
  getLanguageStatistics: StreamlinedProcessor.getLanguageStatistics.bind(StreamlinedProcessor),
  cleanup: StreamlinedProcessor.cleanup.bind(StreamlinedProcessor),
};
