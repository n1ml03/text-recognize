import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Eye, 
  CheckCircle, 
  Download, 
  Settings, 
  Loader2, 
  FileText, 
  Zap, 
  Save,
  AlertTriangle,
  Globe,
  Monitor
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  useFileState, 
  useOCRState, 
  useTextState, 
  useGrammarState,
  useExportState,
  useAppStore 
} from '@/store/app-store';
import { streamlinedProcessor } from '@/lib/streamlined-processors';
import { universalFileApi } from '@/lib/universal-file-api';

interface TabConfig {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
  description: string;
}

const tabs: TabConfig[] = [
  { id: 'ocr', label: 'Text Extraction', icon: Eye, description: 'Extract text from files' },
  { id: 'grammar', label: 'Grammar Check', icon: CheckCircle, description: 'Check grammar and style' },
  { id: 'export', label: 'Export', icon: Download, description: 'Export processed text' },
];

const getTabDisplayLabel = (tab: TabConfig, isSmallScreen: boolean) => {
  if (isSmallScreen) {
    const shortLabels: Record<string, string> = {
      'ocr': 'OCR',
      'grammar': 'Grammar',
      'export': 'Export'
    };
    return shortLabels[tab.id] || tab.label;
  }
  
  return tab.label;
};

export function ProcessingPanel() {
  const [activeTab, setActiveTab] = useState('ocr');
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [autoCorrect, setAutoCorrect] = useState(false);
  const [smartMode, setSmartMode] = useState(true);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [autoApplyTypes, setAutoApplyTypes] = useState<string[]>(['spelling', 'punctuation']);
  const [exportOptions, setExportOptions] = useState({
    appendMode: true,
    includeHeaders: true,
    maxTextLength: 1000,
  });

  // Handle responsive screen size detection
  useEffect(() => {
    const checkScreenSize = () => {
      setIsSmallScreen(window.innerWidth < 640);
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  const { currentFile } = useFileState();
  const { 
    ocrResult, 
    preprocessingOptions, 
    isProcessingOCR, 
    setOCRResult, 
    setProcessingOCR,
    setPreprocessingOptions
  } = useOCRState();
  const { editedText, setEditedText, setOriginalText } = useTextState();
  const { 
    grammarResult, 
    isCheckingGrammar, 
    setGrammarResult, 
    setCheckingGrammar,
    setLanguageStats 
  } = useGrammarState();
  const { isExporting, addExportRecord, setExporting } = useExportState();
  const { setError } = useAppStore();

  const isWebEnvironment = universalFileApi.isWebEnvironment();

  // OCR Processing
  const handleProcessOCR = async () => {
    if (!currentFile) {
      setError('Please select a file first');
      return;
    }

    setProcessingOCR(true);
    setError(null);

    try {
      const result = await streamlinedProcessor.processFile(currentFile, {
        ocr_options: preprocessingOptions,
      });

      const ocrResultData = {
        text: result.text,
        confidence: result.confidence || 0.9,
        engine_used: result.engine_used,
        processing_time: result.processing_time / 1000,
        word_details: result.word_details || [],
      };

      setOCRResult(ocrResultData);
      setOriginalText(result.text);
    } catch (error) {
      console.error('Text extraction failed:', error);
      let errorMessage = error instanceof Error ? error.message : 'Text extraction failed';
      if (isWebEnvironment) {
        errorMessage += '\n\nNote: Web version uses optimized Tesseract.js for OCR.';
      }
      setError(errorMessage);
    } finally {
      setProcessingOCR(false);
    }
  };

  // Enhanced Grammar Check
  const handleGrammarCheck = async () => {
    if (!editedText.trim()) {
      setError('Please enter some text to check');
      return;
    }

    setCheckingGrammar(true);
    setError(null);

    try {
      const [grammarResult, stats] = await Promise.all([
        streamlinedProcessor.checkGrammar(editedText, autoCorrect, smartMode),
        streamlinedProcessor.getLanguageStatistics(editedText)
      ]);
      
      setGrammarResult(grammarResult);
      setLanguageStats(stats);
      
      // Apply corrections based on mode
      if (grammarResult.corrected_text !== editedText) {
        setEditedText(grammarResult.corrected_text);
      }
    } catch (error) {
      console.error('Grammar check failed:', error);
      let errorMessage = error instanceof Error ? error.message : 'Grammar check failed';
      if (isWebEnvironment && errorMessage.includes('LanguageTool API error')) {
        errorMessage += '\n\nNote: Both web and desktop versions use LanguageTool for optimal accuracy.';
      }
      setError(errorMessage);
    } finally {
      setCheckingGrammar(false);
    }
  };

  // Selective correction application
  const handleSelectiveCorrections = async (types: string[]) => {
    if (!editedText.trim()) return;

    try {
      const correctedText = await streamlinedProcessor.applySelectiveCorrections(editedText, types);
      if (correctedText !== editedText) {
        setEditedText(correctedText);
        // Recheck grammar after applying corrections
        setTimeout(() => handleGrammarCheck(), 500);
      }
    } catch (error) {
      console.error('Failed to apply selective corrections:', error);
      setError('Failed to apply selective corrections');
    }
  };

  // Export Functions
  const handleExport = async () => {
    if (!editedText.trim()) {
      setError('No text to export');
      return;
    }

    try {
      setExporting(true);
      setError(null);

      // Create export record
      const record = {
        timestamp: new Date().toISOString(),
        original_text: editedText,
        corrected_text: editedText,
        grammar_error_count: grammarResult?.error_count || 0,
        ocr_engine: ocrResult?.engine_used || 'Manual',
        ocr_confidence: ocrResult?.confidence || 0,
        processing_time: (ocrResult?.processing_time || 0) + (grammarResult?.processing_time || 0),
        source_type: ocrResult ? 'OCR' : 'Manual',
        error_summary: grammarResult?.errors.map(e => `${e.category}: ${e.message}`).join('; ') || '',
      };

      // For web environment, use browser download
      if (isWebEnvironment) {
        const csvContent = `"Original Text","Corrected Text","Grammar Error Count","OCR Engine","OCR Confidence","Processing Time","Source Type","Error Summary","Timestamp"\n` +
          `"${record.original_text.replace(/"/g, '""')}","${record.corrected_text.replace(/"/g, '""')}","${record.grammar_error_count}","${record.ocr_engine}","${record.ocr_confidence}","${record.processing_time}","${record.source_type}","${record.error_summary.replace(/"/g, '""')}","${record.timestamp}"`;
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ocr-export-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // For desktop environment, use Tauri save dialog
        const { save } = await import('@tauri-apps/plugin-dialog');
        const { exportApi } = await import('@/lib/tauri-api');
        
        const filePath = await save({
          filters: [{ name: 'CSV Files', extensions: ['csv'] }],
          defaultPath: `ocr-export-${new Date().toISOString().split('T')[0]}.csv`,
        });

        if (!filePath) return;

        await exportApi.exportToCsv(filePath, record, {
          append_mode: exportOptions.appendMode,
          include_headers: exportOptions.includeHeaders,
          max_text_length: exportOptions.maxTextLength,
        });
      }

      addExportRecord(record);
    } catch (error) {
      console.error('Export failed:', error);
      setError(`Export failed: ${error}`);
    } finally {
      setExporting(false);
    }
  };

  const exportAsText = () => {
    if (!editedText.trim()) {
      setError('No text to export');
      return;
    }

    const blob = new Blob([editedText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `text-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };



  // Helper functions
  const updatePreprocessingOption = (key: keyof typeof preprocessingOptions, value: any) => {
    setPreprocessingOptions({ ...preprocessingOptions, [key]: value });
  };

  const applyCorrection = async (errorIndex: number) => {
    if (!grammarResult) return;

    try {
      const error = grammarResult.errors[errorIndex];
      if (error && error.suggestions.length > 0) {
        const suggestion = error.suggestions[0];
        const beforeText = editedText.substring(0, error.offset);
        const afterText = editedText.substring(error.offset + error.length);
        const correctedText = beforeText + suggestion + afterText;
        
        setEditedText(correctedText);
        setTimeout(() => handleGrammarCheck(), 500);
      }
    } catch (error) {
      console.error('Failed to apply correction:', error);
      setError('Failed to apply correction');
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'ocr':
        return (
          <div className="space-y-4">
            {/* File Info */}
            {currentFile && (
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="text-sm font-medium truncate" title={currentFile.name}>
                  {currentFile.name}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                  <span>{currentFile.file_type}</span>
                  <span>•</span>
                  <span>{(currentFile.size / 1024).toFixed(1)} KB</span>
                  <span>•</span>
                  <span>{isWebEnvironment ? 'Tesseract.js' : 'Native OCR'}</span>
                </div>
              </div>
            )}

            {/* Advanced Options */}
            <AnimatePresence>
              {showAdvancedOptions && currentFile?.file_type === 'Image' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="bg-muted/30 rounded-lg p-4 space-y-3"
                >
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <Settings className="h-3 w-3" />
                    Image Preprocessing
                  </h4>
                  <div className="grid gap-3">
                    <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-muted/20 transition-colors">
                      <Checkbox 
                        checked={preprocessingOptions.enhance_contrast}
                        onCheckedChange={(checked) => updatePreprocessingOption('enhance_contrast', checked)}
                      />
                      <div className="flex flex-col flex-1">
                        <span className="text-sm font-medium">Enhance Contrast</span>
                        <span className="text-xs text-muted-foreground">Improve text visibility</span>
                      </div>
                    </label>
                    
                    <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-muted/20 transition-colors">
                      <Checkbox 
                        checked={preprocessingOptions.denoise}
                        onCheckedChange={(checked) => updatePreprocessingOption('denoise', checked)}
                      />
                      <div className="flex flex-col flex-1">
                        <span className="text-sm font-medium">Noise Reduction</span>
                        <span className="text-xs text-muted-foreground">Remove image artifacts</span>
                      </div>
                    </label>
                    
                    <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-muted/20 transition-colors">
                      <Checkbox 
                        checked={preprocessingOptions.apply_morphology}
                        onCheckedChange={(checked) => updatePreprocessingOption('apply_morphology', checked)}
                      />
                      <div className="flex flex-col flex-1">
                        <span className="text-sm font-medium">Morphological Operations</span>
                        <span className="text-xs text-muted-foreground">Clean up text shapes</span>
                      </div>
                    </label>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Process Button */}
            <Button
              onClick={handleProcessOCR}
              disabled={!currentFile || isProcessingOCR}
              className="w-full relative overflow-hidden group"
              size="lg"
            >
              <div className="flex items-center justify-center">
                {isProcessingOCR ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4 mr-2 transition-transform group-hover:scale-110" />
                    <span>
                      {!currentFile ? 'Select File First' : 'Extract Text'}
                    </span>
                  </>
                )}
              </div>
              {!isProcessingOCR && currentFile && (
                <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </Button>

            {/* Processing Progress */}
            <AnimatePresence>
              {isProcessingOCR && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-2"
                >
                  <Progress value={undefined} className="w-full" />
                  <p className="text-sm text-muted-foreground text-center">
                    Analyzing and extracting text...
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* OCR Results */}
            <AnimatePresence>
              {ocrResult && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 rounded-lg p-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="h-4 w-4 text-green-600" />
                    <span className="font-medium text-sm text-green-800 dark:text-green-200">
                      Text Extracted Successfully
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="space-y-1">
                      <span className="text-muted-foreground block">Engine:</span>
                      <p className="font-medium truncate" title={ocrResult.engine_used}>{ocrResult.engine_used}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground block">Confidence:</span>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{(ocrResult.confidence * 100).toFixed(1)}%</p>
                        <div className="flex-1 bg-green-200/50 rounded-full h-1.5">
                          <div 
                            className="bg-green-600 h-1.5 rounded-full transition-all duration-500"
                            style={{ width: `${ocrResult.confidence * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground block">Time:</span>
                      <p className="font-medium">{ocrResult.processing_time.toFixed(2)}s</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground block">Words:</span>
                      <p className="font-medium">{ocrResult.word_details.length}</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );

      case 'grammar':
        return (
          <div className="space-y-6">
            {/* Grammar Settings - All White */}
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-4">
                <Settings className="h-4 w-4 text-gray-600" />
                <h4 className="font-medium text-gray-900">Grammar Settings</h4>
              </div>
              
              <div className="space-y-4">
                {/* Smart Mode Toggle */}
                <div className="flex items-center justify-between p-3 border border-gray-100 rounded-md bg-white">
                  <div className="flex items-center gap-3">
                    <Checkbox 
                      checked={smartMode}
                      onCheckedChange={setSmartMode}
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-900">Smart Mode</div>
                      <div className="text-xs text-gray-500">AI-powered intelligent corrections</div>
                    </div>
                  </div>
                  <div className={`px-2 py-1 rounded text-xs font-medium ${
                    smartMode 
                      ? 'bg-gray-100 text-gray-700' 
                      : 'bg-white text-gray-500 border border-gray-200'
                  }`}>
                    {smartMode ? 'Enabled' : 'Disabled'}
                  </div>
                </div>

                {/* Auto-correct Toggle */}
                <div className="flex items-center justify-between p-3 border border-gray-100 rounded-md bg-white">
                  <div className="flex items-center gap-3">
                    <Checkbox 
                      checked={autoCorrect}
                      onCheckedChange={setAutoCorrect}
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-900">Auto-apply All</div>
                      <div className="text-xs text-gray-500">Apply all found corrections automatically</div>
                    </div>
                  </div>
                </div>

                {/* Selective Auto-Apply */}
                <div className="pt-2 border-t border-gray-100">
                  <div className="text-xs font-medium text-gray-700 mb-3">Auto-apply for specific types:</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'spelling', label: 'Spelling', icon: 'Aa' },
                      { key: 'punctuation', label: 'Punctuation', icon: '.,;' },
                      { key: 'grammar', label: 'Grammar', icon: '✓' },
                      { key: 'style', label: 'Style', icon: '✦' }
                    ].map((type) => (
                      <label key={type.key} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer bg-white">
                        <Checkbox
                          checked={autoApplyTypes.includes(type.key)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setAutoApplyTypes(prev => [...prev, type.key]);
                            } else {
                              setAutoApplyTypes(prev => prev.filter(t => t !== type.key));
                            }
                          }}
                          className="h-3 w-3"
                        />
                        <span className="text-xs text-gray-600 font-mono">{type.icon}</span>
                        <span className="text-xs text-gray-700">{type.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                onClick={handleGrammarCheck}
                disabled={!editedText.trim() || isCheckingGrammar}
                className="flex-1 bg-gray-900 hover:bg-gray-800 text-white"
                size="lg"
              >
                <div className="flex items-center justify-center">
                  {isCheckingGrammar ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      <span>Analyzing...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      <span>{smartMode ? 'Smart Check' : 'Check Grammar'}</span>
                    </>
                  )}
                </div>
              </Button>

              {autoApplyTypes.length > 0 && !isCheckingGrammar && (
                <Button
                  onClick={() => handleSelectiveCorrections(autoApplyTypes)}
                  variant="outline"
                  size="lg"
                  className="px-4 border-gray-300 hover:bg-gray-50 bg-white"
                  title="Apply selected correction types"
                >
                  <Zap className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Processing Progress */}
            {isCheckingGrammar && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-gray-200 rounded-lg p-4"
              >
                <Progress value={undefined} className="w-full mb-3" />
                <p className="text-sm text-gray-600 text-center">
                  {smartMode ? 'AI is analyzing your text...' : 'Checking grammar and style...'}
                </p>
              </motion.div>
            )}

            {/* Grammar Results - All White */}
            {grammarResult && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                {/* Summary Card - White */}
                <div className="bg-white border border-gray-200 rounded-lg p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      {grammarResult.error_count === 0 ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                      )}
                      <h4 className="font-medium text-gray-900">Analysis Complete</h4>
                    </div>
                    <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                      {grammarResult.processing_time.toFixed(2)}s
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-light text-gray-900">
                        {grammarResult.error_count}
                      </span>
                      <span className="text-sm text-gray-600">
                        {grammarResult.error_count === 0 ? 'Perfect!' : grammarResult.error_count === 1 ? 'issue found' : 'issues found'}
                      </span>
                    </div>
                    
                    {grammarResult.error_count > 0 && (
                      <Button
                        onClick={() => handleSelectiveCorrections(['spelling', 'punctuation'])}
                        size="sm"
                        variant="outline"
                        className="border-gray-300 bg-white hover:bg-gray-50"
                      >
                        <Zap className="h-3 w-3 mr-1" />
                        Fix Safe Issues
                      </Button>
                    )}
                  </div>
                </div>

                {/* Errors List - All White Backgrounds */}
                {grammarResult.errors.length > 0 && (
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    <div className="text-sm font-medium text-gray-700 px-1">Issues Found</div>
                    {grammarResult.errors.map((error, index) => {
                      const typeInfo = {
                        spelling: { color: 'border-l-red-400', label: 'Spelling' },
                        grammar: { color: 'border-l-orange-400', label: 'Grammar' },
                        punctuation: { color: 'border-l-blue-400', label: 'Punctuation' },
                        style: { color: 'border-l-purple-400', label: 'Style' },
                        default: { color: 'border-l-gray-400', label: 'Other' }
                      };

                      const errorType = error.error_type || 'default';
                      const info = typeInfo[errorType as keyof typeof typeInfo] || typeInfo.default;

                      return (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className={`bg-white border-l-4 ${info.color} border border-gray-200 rounded-r-lg p-4 hover:shadow-sm transition-shadow`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                                  {info.label}
                                </span>
                                {error.confidence && (
                                  <span className="text-xs text-gray-400">
                                    {Math.round(error.confidence * 100)}%
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-800 mb-3 leading-relaxed">
                                {error.message}
                              </p>
                              {error.suggestions.length > 0 && (
                                <div className="space-y-2">
                                  <div className="text-xs text-gray-500">Suggestions:</div>
                                  <div className="flex flex-wrap gap-2">
                                    {error.suggestions.slice(0, 3).map((suggestion, suggestionIndex) => (
                                      <Button
                                        key={suggestionIndex}
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => applyCorrection(index)}
                                        className="h-7 px-2 text-xs bg-white border border-gray-200 hover:bg-gray-50 rounded"
                                        title={`Apply: ${suggestion}`}
                                      >
                                        {suggestion}
                                      </Button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => applyCorrection(index)}
                              className="h-7 w-7 shrink-0 hover:bg-gray-50 bg-white"
                              title="Apply first suggestion"
                            >
                              <Zap className="h-3 w-3" />
                            </Button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}
          </div>
        );



      case 'export':
        return (
          <div className="space-y-4">
            {/* Export Summary */}
            {editedText && (
              <div className="bg-muted/50 rounded-lg p-4 border border-border/50">
                <h4 className="font-medium text-sm mb-3">Export Summary</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Text length:</span>
                    <span className="font-medium">{editedText.length} chars</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Word count:</span>
                    <span className="font-medium">{editedText.trim() ? editedText.trim().split(/\s+/).length : 0} words</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">OCR processed:</span>
                    <div className="flex items-center gap-1">
                      {ocrResult && <CheckCircle className="h-3 w-3 text-green-500" />}
                      <span className={`font-medium ${ocrResult ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                        {ocrResult ? 'Yes' : 'No'}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Grammar checked:</span>
                    <div className="flex items-center gap-1">
                      {grammarResult && <CheckCircle className="h-3 w-3 text-green-500" />}
                      <span className={`font-medium ${grammarResult ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                        {grammarResult ? 'Yes' : 'No'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Export Options */}
            <div className="bg-muted/30 rounded-lg p-4 space-y-3">
              <h4 className="font-medium text-sm">Export Options</h4>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-muted/20 transition-colors">
                  <Checkbox
                    checked={exportOptions.appendMode}
                    onCheckedChange={(checked) => 
                      setExportOptions(prev => ({ ...prev, appendMode: !!checked }))
                    }
                  />
                  <span className="text-sm">Append to existing file</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-muted/20 transition-colors">
                  <Checkbox
                    checked={exportOptions.includeHeaders}
                    onCheckedChange={(checked) => 
                      setExportOptions(prev => ({ ...prev, includeHeaders: !!checked }))
                    }
                  />
                  <span className="text-sm">Include column headers</span>
                </label>
              </div>
            </div>

            {/* Export Buttons */}
            <div className="space-y-2">
              <Button
                onClick={handleExport}
                disabled={!editedText.trim() || isExporting}
                className="w-full relative overflow-hidden group"
                size="lg"
              >
                <div className="flex items-center justify-center">
                  {isExporting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      <span>Exporting...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2 transition-transform group-hover:scale-110" />
                      <span>Export to CSV</span>
                    </>
                  )}
                </div>
                {!isExporting && editedText.trim() && (
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </Button>
              
              <Button
                variant="outline"
                onClick={exportAsText}
                disabled={!editedText.trim()}
                className="w-full group"
                size="lg"
              >
                <FileText className="h-4 w-4 mr-2 transition-transform group-hover:scale-110" />
                <span>Export as Text</span>
              </Button>
            </div>

            {/* No Text Message */}
            {!editedText.trim() && (
              <div className="text-center py-8 text-muted-foreground">
                <Download className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Process text to enable export</p>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              <span>Processing Center</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
              {isWebEnvironment ? (
                <>
                  <Globe className="h-3 w-3" />
                  Web
                </>
              ) : (
                <>
                  <Monitor className="h-3 w-3" />
                  Desktop
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {activeTab === 'ocr' && currentFile?.file_type === 'Image' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                className="h-7 w-7"
                title="Advanced OCR options"
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Tab Navigation */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            return (
              <Button
                key={tab.id}
                variant="ghost"
                size="sm"
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 transition-all ${
                  isActive 
                    ? 'bg-background shadow-sm text-foreground border border-border/50' 
                    : 'hover:bg-background/50'
                }`}
                title={tab.description}
              >
                <Icon className={`h-4 w-4 ${isSmallScreen ? '' : 'mr-2'}`} />
                <span className={`${isSmallScreen ? 'hidden xs:inline text-xs' : 'hidden sm:inline text-sm'}`}>
                  {getTabDisplayLabel(tab, isSmallScreen)}
                </span>
              </Button>
            );
          })}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {renderTabContent()}
          </motion.div>
        </AnimatePresence>

        {/* No File Selected */}
        {!currentFile && activeTab === 'ocr' && (
          <div className="text-center py-6 text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Upload a file to start processing</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}