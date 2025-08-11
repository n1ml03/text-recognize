import type { FileInfo } from './tauri-api';

// Universal file interface that works in both web and desktop
export interface UniversalFile {
  name: string;
  size: number;
  type: string;
  extension: string;
  content?: ArrayBuffer | string;
  webFile?: File; // For web environment
  path?: string; // For desktop environment
}

// Environment detection
export function isWebEnvironment(): boolean {
  return typeof window !== 'undefined' && !window.__TAURI__;
}

export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && window.__TAURI__ !== undefined;
}

// Web-compatible file processing utilities
export class WebFileHandler {
  static async readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  static async readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  static async readFileAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  static getFileExtension(fileName: string): string {
    const lastDot = fileName.lastIndexOf('.');
    return lastDot > -1 ? fileName.substring(lastDot + 1).toLowerCase() : '';
  }

  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  static convertWebFileToUniversal(file: File): UniversalFile {
    return {
      name: file.name,
      size: file.size,
      type: file.type,
      extension: this.getFileExtension(file.name),
      webFile: file,
    };
  }
}

// Universal file API that works in both environments
export class UniversalFileAPI {
  // Supported formats (shared between web and desktop)
  static getSupportedImageFormats(): string[] {
    return ['png', 'jpg', 'jpeg', 'bmp', 'tiff', 'tif', 'gif', 'webp'];
  }

  static getSupportedVideoFormats(): string[] {
    return ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'm4v', '3gp', 'webm', 'ogv'];
  }

  static getSupportedDocumentFormats(): string[] {
    return ['docx', 'doc', 'rtf', 'odt', 'txt'];
  }

  static getSupportedPdfFormats(): string[] {
    return ['pdf'];
  }

  static getAllSupportedFormats(): string[] {
    return [
      ...this.getSupportedImageFormats(),
      ...this.getSupportedVideoFormats(),
      ...this.getSupportedDocumentFormats(),
      ...this.getSupportedPdfFormats(),
    ];
  }

  // File validation
  static isValidFileType(fileName: string): boolean {
    const extension = WebFileHandler.getFileExtension(fileName);
    return this.getAllSupportedFormats().includes(extension);
  }

  static determineFileType(extension: string): 'Image' | 'Video' | 'Document' | 'Pdf' | 'Unknown' {
    const ext = extension.toLowerCase();
    
    if (this.getSupportedImageFormats().includes(ext)) {
      return 'Image';
    } else if (this.getSupportedVideoFormats().includes(ext)) {
      return 'Video';
    } else if (this.getSupportedDocumentFormats().includes(ext)) {
      return 'Document';
    } else if (this.getSupportedPdfFormats().includes(ext)) {
      return 'Pdf';
    } else {
      return 'Unknown';
    }
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

  // Environment-aware file operations
  static async getFileInfo(filePathOrFile: string | File): Promise<FileInfo> {
    if (isTauriEnvironment() && typeof filePathOrFile === 'string') {
      // Use Tauri API for desktop
      const { fileApi: tauriFileApi } = await import('./tauri-api');
      return await tauriFileApi.getFileInfo(filePathOrFile);
    } else if (isWebEnvironment() && filePathOrFile instanceof File) {
      // Use web API for browser
      const universalFile = WebFileHandler.convertWebFileToUniversal(filePathOrFile);
      return await this.createFileInfo(universalFile);
    } else {
      throw new Error('Invalid file input for current environment');
    }
  }

  static async validateFile(filePathOrFile: string | File): Promise<boolean> {
    try {
      if (isTauriEnvironment() && typeof filePathOrFile === 'string') {
        console.log('Validating desktop file:', filePathOrFile);
        const { fileApi: tauriFileApi } = await import('./tauri-api');
        const result = await tauriFileApi.validateFilePath(filePathOrFile);
        console.log('Desktop file validation result:', result);
        return result;
      } else if (isWebEnvironment() && filePathOrFile instanceof File) {
        // Basic validation for web files
        console.log('Validating web file:', filePathOrFile.name, 'Size:', filePathOrFile.size, 'Type:', filePathOrFile.type);

        // Check file size
        if (filePathOrFile.size === 0) {
          console.log('File validation failed: file is empty');
          return false;
        }

        // Check file type
        const isValidType = this.isValidFileType(filePathOrFile.name);
        console.log('File type valid:', isValidType, 'Extension:', WebFileHandler.getFileExtension(filePathOrFile.name));

        if (!isValidType) {
          console.log('Supported formats:', this.getAllSupportedFormats());
        }

        return isValidType;
      }
      console.log('File validation failed - invalid environment or file type');
      console.log('Environment check - Web:', isWebEnvironment(), 'Tauri:', isTauriEnvironment());
      console.log('File input type:', typeof filePathOrFile, 'Is File:', filePathOrFile instanceof File);
      return false;
    } catch (error) {
      console.error('File validation error:', error);
      return false;
    }
  }

  static async isSupported(filePathOrFile: string | File, type: 'image' | 'video' | 'document' | 'pdf'): Promise<boolean> {
    try {
      if (isTauriEnvironment() && typeof filePathOrFile === 'string') {
        const { fileApi: tauriFileApi } = await import('./tauri-api');
        switch (type) {
          case 'image':
            return await tauriFileApi.isSupportedImage(filePathOrFile);
          case 'video':
            return await tauriFileApi.isSupportedVideo(filePathOrFile);
          case 'document':
            return await tauriFileApi.isSupportedDocument(filePathOrFile);
          case 'pdf':
            return await tauriFileApi.isSupportedPdf(filePathOrFile);
        }
      } else if (isWebEnvironment() && filePathOrFile instanceof File) {
        const extension = WebFileHandler.getFileExtension(filePathOrFile.name);
        switch (type) {
          case 'image':
            return this.getSupportedImageFormats().includes(extension);
          case 'video':
            return this.getSupportedVideoFormats().includes(extension);
          case 'document':
            return this.getSupportedDocumentFormats().includes(extension);
          case 'pdf':
            return this.getSupportedPdfFormats().includes(extension);
        }
      }
      return false;
    } catch {
      return false;
    }
  }
}

// File picker utilities for web environment
export class WebFilePicker {
  static createFileInput(accept?: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';
    if (accept) {
      input.accept = accept;
    }
    return input;
  }

  static async pickFile(options?: {
    accept?: string;
    multiple?: boolean;
  }): Promise<File | File[] | null> {
    return new Promise((resolve) => {
      const input = this.createFileInput(options?.accept);
      input.multiple = options?.multiple || false;

      input.onchange = (event) => {
        const target = event.target as HTMLInputElement;
        const files = target.files;
        
        if (!files || files.length === 0) {
          resolve(null);
          return;
        }

        if (options?.multiple) {
          resolve(Array.from(files));
        } else {
          resolve(files[0]);
        }

        // Clean up
        document.body.removeChild(input);
      };

      input.oncancel = () => {
        resolve(null);
        document.body.removeChild(input);
      };

      document.body.appendChild(input);
      input.click();
    });
  }

  static getAcceptString(): string {
    const formats = UniversalFileAPI.getAllSupportedFormats();
    return formats.map(ext => `.${ext}`).join(',');
  }
}

// Export the universal file API
export const universalFileApi = {
  // Environment detection
  isWebEnvironment,
  isTauriEnvironment,
  
  // File operations
  getFileInfo: UniversalFileAPI.getFileInfo,
  validateFile: UniversalFileAPI.validateFile,
  isSupported: UniversalFileAPI.isSupported,
  
  // Format information
  getSupportedFormats: () => ({
    image: UniversalFileAPI.getSupportedImageFormats(),
    video: UniversalFileAPI.getSupportedVideoFormats(),
    document: UniversalFileAPI.getSupportedDocumentFormats(),
    pdf: UniversalFileAPI.getSupportedPdfFormats(),
    all: UniversalFileAPI.getAllSupportedFormats(),
  }),
  
  // File picking
  pickFile: async (options?: { multiple?: boolean }) => {
    if (isTauriEnvironment()) {
      // Use Tauri dialog for desktop
      const { open } = await import('@tauri-apps/plugin-dialog');
      const allFormats = UniversalFileAPI.getAllSupportedFormats();
      
      const filters = [
        {
          name: 'All Supported Files',
          extensions: allFormats,
        },
        {
          name: 'Images',
          extensions: UniversalFileAPI.getSupportedImageFormats(),
        },
        {
          name: 'Videos',
          extensions: UniversalFileAPI.getSupportedVideoFormats(),
        },
        {
          name: 'Documents',
          extensions: UniversalFileAPI.getSupportedDocumentFormats(),
        },
        {
          name: 'PDF Files',
          extensions: UniversalFileAPI.getSupportedPdfFormats(),
        },
      ];

      return await open({
        multiple: options?.multiple || false,
        filters,
        title: 'Select file for processing',
      });
    } else {
      // Use web file picker for browser
      return await WebFilePicker.pickFile({
        accept: WebFilePicker.getAcceptString(),
        multiple: options?.multiple,
      });
    }
  },
  
  // Utilities
  formatFileSize: WebFileHandler.formatFileSize,
  getFileExtension: WebFileHandler.getFileExtension,
  WebFileHandler,
};
