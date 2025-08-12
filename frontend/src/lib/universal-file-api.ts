import type { FileInfo } from './tauri-api';

// Universal file interface that works in both web and desktop
export interface UniversalFile {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  readonly extension: string;
  readonly content?: ArrayBuffer | string;
  readonly webFile?: File; // For web environment
  readonly path?: string; // For desktop environment
}

// File type constants for better type safety
export const FILE_TYPES = {
  IMAGE: 'Image',
  VIDEO: 'Video',
  DOCUMENT: 'Document',
  PDF: 'Pdf',
  UNKNOWN: 'Unknown'
} as const;

export type FileType = typeof FILE_TYPES[keyof typeof FILE_TYPES];

// Supported file formats - using readonly arrays for immutability
const SUPPORTED_FORMATS = {
  IMAGE: ['png', 'jpg', 'jpeg', 'bmp', 'tiff', 'tif', 'gif', 'webp'] as const,
  VIDEO: ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'm4v', '3gp', 'webm', 'ogv'] as const,
  DOCUMENT: ['docx', 'doc', 'rtf', 'odt', 'txt'] as const,
  PDF: ['pdf'] as const,
} as const;

// Environment detection with memoization for performance
let _isWebEnv: boolean | null = null;
let _isTauriEnv: boolean | null = null;

export function isWebEnvironment(): boolean {
  if (_isWebEnv === null) {
    _isWebEnv = typeof window !== 'undefined' && !window.__TAURI__;
  }
  return _isWebEnv;
}

export function isTauriEnvironment(): boolean {
  if (_isTauriEnv === null) {
    _isTauriEnv = typeof window !== 'undefined' && window.__TAURI__ !== undefined;
  }
  return _isTauriEnv;
}

// Web-compatible file processing utilities
export class WebFileHandler {
  // Generic file reader method to reduce code duplication
  private static createFileReader<T>(
    file: File,
    readMethod: (reader: FileReader, file: File) => void
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as T);
      reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
      readMethod(reader, file);
    });
  }

  static async readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return this.createFileReader<ArrayBuffer>(file, (reader, f) => reader.readAsArrayBuffer(f));
  }

  static async readFileAsText(file: File): Promise<string> {
    return this.createFileReader<string>(file, (reader, f) => reader.readAsText(f));
  }

  static async readFileAsDataURL(file: File): Promise<string> {
    return this.createFileReader<string>(file, (reader, f) => reader.readAsDataURL(f));
  }

  static getFileExtension(fileName: string): string {
    if (!fileName || typeof fileName !== 'string') return '';
    const lastDot = fileName.lastIndexOf('.');
    return lastDot > -1 ? fileName.substring(lastDot + 1).toLowerCase() : '';
  }

  static formatFileSize(bytes: number): string {
    if (!bytes || bytes === 0) return '0 Bytes';

    const units = ['Bytes', 'KB', 'MB', 'GB', 'TB'] as const;
    const base = 1024;
    const unitIndex = Math.floor(Math.log(bytes) / Math.log(base));
    const size = bytes / Math.pow(base, unitIndex);

    return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
  }

  static convertWebFileToUniversal(file: File): UniversalFile {
    const extension = this.getFileExtension(file.name);
    return {
      name: file.name,
      size: file.size,
      type: file.type,
      extension,
      webFile: file,
    };
  }
}

// Universal file API that works in both environments
export class UniversalFileAPI {
  // Cached format arrays for performance
  private static _allFormats: readonly string[] | null = null;

  // Supported formats (shared between web and desktop) - now using the constants
  static getSupportedImageFormats(): readonly string[] {
    return SUPPORTED_FORMATS.IMAGE;
  }

  static getSupportedVideoFormats(): readonly string[] {
    return SUPPORTED_FORMATS.VIDEO;
  }

  static getSupportedDocumentFormats(): readonly string[] {
    return SUPPORTED_FORMATS.DOCUMENT;
  }

  static getSupportedPdfFormats(): readonly string[] {
    return SUPPORTED_FORMATS.PDF;
  }

  static getAllSupportedFormats(): readonly string[] {
    if (!this._allFormats) {
      this._allFormats = [
        ...SUPPORTED_FORMATS.IMAGE,
        ...SUPPORTED_FORMATS.VIDEO,
        ...SUPPORTED_FORMATS.DOCUMENT,
        ...SUPPORTED_FORMATS.PDF,
      ];
    }
    return this._allFormats;
  }

  // File validation with better error handling
  static isValidFileType(fileName: string): boolean {
    if (!fileName || typeof fileName !== 'string') return false;
    const extension = WebFileHandler.getFileExtension(fileName);
    return this.getAllSupportedFormats().includes(extension);
  }

  static determineFileType(extension: string): FileType {
    if (!extension || typeof extension !== 'string') return FILE_TYPES.UNKNOWN;

    const ext = extension.toLowerCase();

    // Use proper type checking with readonly arrays
    if ((SUPPORTED_FORMATS.IMAGE as readonly string[]).includes(ext)) return FILE_TYPES.IMAGE;
    if ((SUPPORTED_FORMATS.VIDEO as readonly string[]).includes(ext)) return FILE_TYPES.VIDEO;
    if ((SUPPORTED_FORMATS.DOCUMENT as readonly string[]).includes(ext)) return FILE_TYPES.DOCUMENT;
    if ((SUPPORTED_FORMATS.PDF as readonly string[]).includes(ext)) return FILE_TYPES.PDF;

    return FILE_TYPES.UNKNOWN;
  }

  // Universal file info creation
  static async createFileInfo(universalFile: UniversalFile): Promise<FileInfo> {
    const fileType = this.determineFileType(universalFile.extension);

    return {
      path: universalFile.path || universalFile.name,
      name: universalFile.name,
      size: universalFile.size,
      extension: universalFile.extension,
      file_type: fileType,
      last_modified: new Date().toISOString(),
    };
  }

  // Environment-aware file operations with better error handling
  static async getFileInfo(filePathOrFile: string | File): Promise<FileInfo> {
    try {
      if (isTauriEnvironment() && typeof filePathOrFile === 'string') {
        const { fileApi: tauriFileApi } = await import('./tauri-api');
        return await tauriFileApi.getFileInfo(filePathOrFile);
      }

      if (isWebEnvironment() && filePathOrFile instanceof File) {
        const universalFile = WebFileHandler.convertWebFileToUniversal(filePathOrFile);
        return await this.createFileInfo(universalFile);
      }

      throw new Error(`Invalid file input for current environment. Expected ${isTauriEnvironment() ? 'string path' : 'File object'}`);
    } catch (error) {
      throw new Error(`Failed to get file info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static async validateFile(filePathOrFile: string | File): Promise<boolean> {
    try {
      if (isTauriEnvironment() && typeof filePathOrFile === 'string') {
        const { fileApi: tauriFileApi } = await import('./tauri-api');
        return await tauriFileApi.validateFilePath(filePathOrFile);
      }

      if (isWebEnvironment() && filePathOrFile instanceof File) {
        // Validate file size (not empty and reasonable size limit)
        const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
        if (filePathOrFile.size === 0 || filePathOrFile.size > MAX_FILE_SIZE) {
          return false;
        }

        // Validate file type
        return this.isValidFileType(filePathOrFile.name);
      }

      return false;
    } catch (error) {
      console.error('File validation error:', error);
      return false;
    }
  }

  static async isSupported(
    filePathOrFile: string | File,
    type: 'image' | 'video' | 'document' | 'pdf'
  ): Promise<boolean> {
    try {
      if (isTauriEnvironment() && typeof filePathOrFile === 'string') {
        const { fileApi: tauriFileApi } = await import('./tauri-api');

        // Use a map for cleaner switch logic
        const tauriMethods = {
          image: tauriFileApi.isSupportedImage,
          video: tauriFileApi.isSupportedVideo,
          document: tauriFileApi.isSupportedDocument,
          pdf: tauriFileApi.isSupportedPdf,
        } as const;

        return await tauriMethods[type](filePathOrFile);
      }

      if (isWebEnvironment() && filePathOrFile instanceof File) {
        const extension = WebFileHandler.getFileExtension(filePathOrFile.name);

        // Use a map for cleaner logic and better performance
        const formatMaps = {
          image: SUPPORTED_FORMATS.IMAGE,
          video: SUPPORTED_FORMATS.VIDEO,
          document: SUPPORTED_FORMATS.DOCUMENT,
          pdf: SUPPORTED_FORMATS.PDF,
        } as const;

        return (formatMaps[type] as readonly string[]).includes(extension);
      }

      return false;
    } catch (error) {
      console.error(`Error checking ${type} support:`, error);
      return false;
    }
  }
}

// File picker utilities for web environment
export class WebFilePicker {
  private static cleanupInput(input: HTMLInputElement): void {
    try {
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
    } catch (error) {
      console.warn('Failed to cleanup file input:', error);
    }
  }

  static createFileInput(accept?: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';
    input.style.position = 'absolute';
    input.style.left = '-9999px';

    if (accept) {
      input.accept = accept;
    }

    return input;
  }

  static async pickFile(options: {
    accept?: string;
    multiple?: boolean;
  } = {}): Promise<File | File[] | null> {
    return new Promise((resolve) => {
      const input = this.createFileInput(options.accept);
      input.multiple = options.multiple ?? false;

      const cleanup = () => this.cleanupInput(input);

      input.onchange = () => {
        const files = input.files;

        if (!files || files.length === 0) {
          resolve(null);
        } else if (options.multiple) {
          resolve(Array.from(files));
        } else {
          resolve(files[0]);
        }

        cleanup();
      };

      input.oncancel = () => {
        resolve(null);
        cleanup();
      };

      // Handle escape key and focus loss
      const handleAbort = () => {
        resolve(null);
        cleanup();
      };

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') handleAbort();
      }, { once: true });

      document.body.appendChild(input);
      input.click();
    });
  }

  static getAcceptString(): string {
    return UniversalFileAPI.getAllSupportedFormats()
      .map(ext => `.${ext}`)
      .join(',');
  }
}

// Optimized universal file API with better performance and type safety
export const universalFileApi = {
  // Environment detection
  isWebEnvironment,
  isTauriEnvironment,

  // File operations
  getFileInfo: UniversalFileAPI.getFileInfo.bind(UniversalFileAPI),
  validateFile: UniversalFileAPI.validateFile.bind(UniversalFileAPI),
  isSupported: UniversalFileAPI.isSupported.bind(UniversalFileAPI),

  // Format information - cached for performance
  getSupportedFormats: (() => {
    let cachedFormats: ReturnType<typeof getSupportedFormats> | null = null;

    function getSupportedFormats() {
      return {
        image: UniversalFileAPI.getSupportedImageFormats(),
        video: UniversalFileAPI.getSupportedVideoFormats(),
        document: UniversalFileAPI.getSupportedDocumentFormats(),
        pdf: UniversalFileAPI.getSupportedPdfFormats(),
        all: UniversalFileAPI.getAllSupportedFormats(),
      };
    }

    return () => {
      if (!cachedFormats) {
        cachedFormats = getSupportedFormats();
      }
      return cachedFormats;
    };
  })(),

  // File picking with better error handling
  pickFile: async (options: { multiple?: boolean } = {}) => {
    try {
      if (isTauriEnvironment()) {
        const { open } = await import('@tauri-apps/plugin-dialog');

        // Convert readonly arrays to mutable arrays for Tauri compatibility
        const filters = [
          {
            name: 'All Supported Files',
            extensions: [...UniversalFileAPI.getAllSupportedFormats()],
          },
          {
            name: 'Images',
            extensions: [...UniversalFileAPI.getSupportedImageFormats()],
          },
          {
            name: 'Videos',
            extensions: [...UniversalFileAPI.getSupportedVideoFormats()],
          },
          {
            name: 'Documents',
            extensions: [...UniversalFileAPI.getSupportedDocumentFormats()],
          },
          {
            name: 'PDF Files',
            extensions: [...UniversalFileAPI.getSupportedPdfFormats()],
          },
        ];

        return await open({
          multiple: options.multiple ?? false,
          filters,
          title: 'Select file for processing',
        });
      } else {
        return await WebFilePicker.pickFile({
          accept: WebFilePicker.getAcceptString(),
          multiple: options.multiple,
        });
      }
    } catch (error) {
      console.error('Error picking file:', error);
      return null;
    }
  },

  // Utilities
  formatFileSize: WebFileHandler.formatFileSize,
  getFileExtension: WebFileHandler.getFileExtension,

  // Constants for external use
  FILE_TYPES,
  SUPPORTED_FORMATS,

  // Classes for advanced usage
  WebFileHandler,
  UniversalFileAPI,
  WebFilePicker,
} as const;
