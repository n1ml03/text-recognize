import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import type { 
  OCRResult, 
  GrammarCheckResult, 
  FileInfo, 
  ExportRecord,
  LanguageStats,
  PreprocessingOptions 
} from '@/lib/tauri-api';

interface AppState {
  // UI State
  theme: 'light' | 'dark' | 'system';
  isLoading: boolean;
  currentView: 'main' | 'batch' | 'history';
  
  // File State
  currentFile: FileInfo | null;
  supportedImageFormats: string[];
  supportedVideoFormats: string[];
  
  // OCR State
  ocrResult: OCRResult | null;
  preprocessingOptions: PreprocessingOptions;
  isProcessingOCR: boolean;
  
  // Grammar State
  grammarResult: GrammarCheckResult | null;
  isCheckingGrammar: boolean;
  languageStats: LanguageStats | null;
  
  // Text State
  originalText: string;
  editedText: string;
  
  // Export State
  exportHistory: ExportRecord[];
  isExporting: boolean;
  
  // Error State
  error: string | null;
  
  // Actions
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setLoading: (loading: boolean) => void;
  setCurrentView: (view: 'main' | 'batch' | 'history') => void;
  setCurrentFile: (file: FileInfo | null) => void;
  setSupportedFormats: (imageFormats: string[], videoFormats: string[]) => void;
  setOCRResult: (result: OCRResult | null) => void;
  setPreprocessingOptions: (options: PreprocessingOptions) => void;
  setProcessingOCR: (processing: boolean) => void;
  setGrammarResult: (result: GrammarCheckResult | null) => void;
  setCheckingGrammar: (checking: boolean) => void;
  setLanguageStats: (stats: LanguageStats | null) => void;
  setOriginalText: (text: string) => void;
  setEditedText: (text: string) => void;
  addExportRecord: (record: ExportRecord) => void;
  setExportHistory: (history: ExportRecord[]) => void;
  setExporting: (exporting: boolean) => void;
  setError: (error: string | null) => void;
  clearAll: () => void;
}

const defaultPreprocessingOptions: PreprocessingOptions = {
  enhance_contrast: true,
  denoise: true,
  threshold_method: 'adaptive_gaussian',
  apply_morphology: true,
};

export const useAppStore = create<AppState>()(
  devtools(
    (set) => ({
      // Initial state
      theme: (typeof window !== 'undefined' && localStorage.getItem('theme') as 'light' | 'dark' | 'system') || 'system',
      isLoading: false,
      currentView: 'main',
      currentFile: null,
      supportedImageFormats: [],
      supportedVideoFormats: [],
      ocrResult: null,
      preprocessingOptions: defaultPreprocessingOptions,
      isProcessingOCR: false,
      grammarResult: null,
      isCheckingGrammar: false,
      languageStats: null,
      originalText: '',
      editedText: '',
      exportHistory: [],
      isExporting: false,
      error: null,

      // Actions
      setTheme: (theme) => {
        set({ theme });
        if (typeof window !== 'undefined') {
          localStorage.setItem('theme', theme);
        }
      },
      setLoading: (isLoading) => set({ isLoading }),
      setCurrentView: (currentView) => set({ currentView }),
      setCurrentFile: (currentFile) => set({ currentFile }),
      setSupportedFormats: (supportedImageFormats, supportedVideoFormats) => 
        set({ supportedImageFormats, supportedVideoFormats }),
      setOCRResult: (ocrResult) => set({ ocrResult }),
      setPreprocessingOptions: (preprocessingOptions) => set({ preprocessingOptions }),
      setProcessingOCR: (isProcessingOCR) => set({ isProcessingOCR }),
      setGrammarResult: (grammarResult) => set({ grammarResult }),
      setCheckingGrammar: (isCheckingGrammar) => set({ isCheckingGrammar }),
      setLanguageStats: (languageStats) => set({ languageStats }),
      setOriginalText: (originalText) => set({ originalText }),
      setEditedText: (editedText) => set({ editedText }),
      addExportRecord: (record) => 
        set((state) => ({ exportHistory: [record, ...state.exportHistory] })),
      setExportHistory: (exportHistory) => set({ exportHistory }),
      setExporting: (isExporting) => set({ isExporting }),
      setError: (error) => set({ error }),
      clearAll: () => set({
        currentFile: null,
        ocrResult: null,
        grammarResult: null,
        languageStats: null,
        originalText: '',
        editedText: '',
        error: null,
      }),
    }),
    {
      name: 'ocr-grammar-assistant-store',
    }
  )
);

// Selector functions to prevent object recreation
const fileStateSelector = (state: AppState) => ({
  currentFile: state.currentFile,
  supportedImageFormats: state.supportedImageFormats,
  supportedVideoFormats: state.supportedVideoFormats,
  setCurrentFile: state.setCurrentFile,
  setSupportedFormats: state.setSupportedFormats,
});

const ocrStateSelector = (state: AppState) => ({
  ocrResult: state.ocrResult,
  preprocessingOptions: state.preprocessingOptions,
  isProcessingOCR: state.isProcessingOCR,
  setOCRResult: state.setOCRResult,
  setPreprocessingOptions: state.setPreprocessingOptions,
  setProcessingOCR: state.setProcessingOCR,
});

const grammarStateSelector = (state: AppState) => ({
  grammarResult: state.grammarResult,
  isCheckingGrammar: state.isCheckingGrammar,
  languageStats: state.languageStats,
  setGrammarResult: state.setGrammarResult,
  setCheckingGrammar: state.setCheckingGrammar,
  setLanguageStats: state.setLanguageStats,
});

const textStateSelector = (state: AppState) => ({
  originalText: state.originalText,
  editedText: state.editedText,
  setOriginalText: state.setOriginalText,
  setEditedText: state.setEditedText,
});

const exportStateSelector = (state: AppState) => ({
  exportHistory: state.exportHistory,
  isExporting: state.isExporting,
  addExportRecord: state.addExportRecord,
  setExportHistory: state.setExportHistory,
  setExporting: state.setExporting,
});

const uiStateSelector = (state: AppState) => ({
  theme: state.theme,
  isLoading: state.isLoading,
  currentView: state.currentView,
  error: state.error,
  setTheme: state.setTheme,
  setLoading: state.setLoading,
  setCurrentView: state.setCurrentView,
  setError: state.setError,
});

// Selectors with shallow comparison to prevent unnecessary re-renders
export const useFileState = () => useAppStore(useShallow(fileStateSelector));
export const useOCRState = () => useAppStore(useShallow(ocrStateSelector));
export const useGrammarState = () => useAppStore(useShallow(grammarStateSelector));
export const useTextState = () => useAppStore(useShallow(textStateSelector));
export const useExportState = () => useAppStore(useShallow(exportStateSelector));
export const useUIState = () => useAppStore(useShallow(uiStateSelector));
