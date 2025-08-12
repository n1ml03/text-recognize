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
  Monitor,
  Sparkles
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
      const ocrResultData = await streamlinedProcessor.processFileForUI(currentFile, {
        ocr_options: preprocessingOptions,
      });

      // Adjust processing time to seconds for display
      ocrResultData.processing_time = ocrResultData.processing_time / 1000;

      setOCRResult(ocrResultData);
      setOriginalText(ocrResultData.text);
    } catch (error) {
      console.error('Text extraction failed:', error);
      let errorMessage = error instanceof Error ? error.message : 'Text extraction failed';
      if (isWebEnvironment) {
        errorMessage += '\n\nNote: Web version uses PaddleOCR backend via HTTP for enhanced accuracy.';
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
            {/* Enhanced Grammar Settings */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 rounded-xl bg-gradient-to-br from-background via-muted/20 to-background border border-border/50 shadow-sm"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20">
                  <Settings className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-lg">Grammar Settings</h4>
                  <p className="text-sm text-muted-foreground">Configure AI-powered text analysis</p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Smart Mode Toggle */}
                <motion.div
                  whileHover={{ scale: 1.01 }}
                  className="flex items-center justify-between p-4 border border-border/50 rounded-xl bg-gradient-to-r from-background to-muted/20 hover:shadow-sm transition-all duration-200"
                >
                  <div className="flex items-center gap-4">
                    <Checkbox
                      checked={smartMode}
                      onCheckedChange={setSmartMode}
                      className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                    <div>
                      <div className="text-sm font-semibold flex items-center gap-2">
                        Smart Mode
                        <Sparkles className="h-4 w-4 text-primary" />
                      </div>
                      <div className="text-xs text-muted-foreground">AI-powered intelligent corrections with context awareness</div>
                    </div>
                  </div>
                  <motion.div
                    animate={{
                      backgroundColor: smartMode ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
                      color: smartMode ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))'
                    }}
                    className="px-3 py-1.5 rounded-full text-xs font-medium border"
                  >
                    {smartMode ? 'Enabled' : 'Disabled'}
                  </motion.div>
                </motion.div>

                {/* Auto-correct Toggle */}
                <motion.div
                  whileHover={{ scale: 1.01 }}
                  className="flex items-center justify-between p-4 border border-border/50 rounded-xl bg-gradient-to-r from-background to-muted/20 hover:shadow-sm transition-all duration-200"
                >
                  <div className="flex items-center gap-4">
                    <Checkbox
                      checked={autoCorrect}
                      onCheckedChange={setAutoCorrect}
                      className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                    <div>
                      <div className="text-sm font-semibold flex items-center gap-2">
                        Auto-apply All
                        <Zap className="h-4 w-4 text-orange-500" />
                      </div>
                      <div className="text-xs text-muted-foreground">Automatically apply all found corrections</div>
                    </div>
                  </div>
                </motion.div>

                {/* Selective Auto-Apply */}
                <div className="pt-4 border-t border-border/30">
                  <div className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    Auto-apply for specific types:
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'spelling', label: 'Spelling', icon: '📝', color: 'text-red-500' },
                      { key: 'punctuation', label: 'Punctuation', icon: '🔤', color: 'text-blue-500' },
                      { key: 'grammar', label: 'Grammar', icon: '✅', color: 'text-green-500' },
                      { key: 'style', label: 'Style', icon: '✨', color: 'text-purple-500' }
                    ].map((type) => (
                      <motion.label
                        key={type.key}
                        className="flex items-center gap-3 p-3 hover:bg-muted/30 rounded-xl cursor-pointer border border-border/30 hover:border-border/50 transition-all duration-200 group"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Checkbox
                          checked={autoApplyTypes.includes(type.key)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setAutoApplyTypes(prev => [...prev, type.key]);
                            } else {
                              setAutoApplyTypes(prev => prev.filter(t => t !== type.key));
                            }
                          }}
                          className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                        <span className={`text-lg ${type.color}`}>{type.icon}</span>
                        <span className="text-sm font-medium group-hover:text-primary transition-colors">{type.label}</span>
                      </motion.label>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Enhanced Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex gap-3"
            >
              <Button
                onClick={handleGrammarCheck}
                disabled={!editedText.trim() || isCheckingGrammar}
                className="flex-1 h-14 text-base font-semibold shadow-lg hover:shadow-xl transition-all duration-300 relative overflow-hidden group"
                size="lg"
              >
                {/* Animated background */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-primary via-primary/90 to-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  animate={{
                    background: isCheckingGrammar
                      ? 'linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--primary))/0.8 50%, hsl(var(--primary)) 100%)'
                      : 'linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--primary))/0.9 50%, hsl(var(--primary)) 100%)'
                  }}
                />

                <div className="relative z-10 flex items-center justify-center">
                  {isCheckingGrammar ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      >
                        <Loader2 className="h-5 w-5 mr-3" />
                      </motion.div>
                      <span>Analyzing text...</span>
                      <motion.div
                        animate={{ opacity: [1, 0.5, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className="ml-2"
                      >
                        <Sparkles className="h-4 w-4" />
                      </motion.div>
                    </>
                  ) : (
                    <>
                      <motion.div
                        whileHover={{ scale: 1.1, rotate: 5 }}
                        transition={{ type: "spring", stiffness: 400 }}
                      >
                        <CheckCircle className="h-5 w-5 mr-3" />
                      </motion.div>
                      <span>{smartMode ? 'Smart Grammar Check' : 'Check Grammar'}</span>
                      {editedText.trim() && (
                        <motion.div
                          animate={{ x: [0, 5, 0] }}
                          transition={{ duration: 2, repeat: Infinity }}
                          className="ml-2"
                        >
                          <Zap className="h-4 w-4" />
                        </motion.div>
                      )}
                    </>
                  )}
                </div>
              </Button>

              {autoApplyTypes.length > 0 && !isCheckingGrammar && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <Button
                    onClick={() => handleSelectiveCorrections(autoApplyTypes)}
                    variant="outline"
                    size="lg"
                    className="px-6 h-14 border-2 hover:bg-primary/5 hover:border-primary/30 transition-all duration-200 group"
                    title="Apply selected correction types"
                  >
                    <motion.div
                      whileHover={{ scale: 1.2, rotate: 15 }}
                      transition={{ type: "spring", stiffness: 400 }}
                    >
                      <Zap className="h-5 w-5 text-primary group-hover:text-primary" />
                    </motion.div>
                  </Button>
                </motion.div>
              )}
            </motion.div>

            {/* Enhanced Processing Progress */}
            <AnimatePresence>
              {isCheckingGrammar && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.95 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="p-6 rounded-xl bg-gradient-to-br from-primary/5 via-primary/3 to-transparent border border-primary/20 shadow-sm"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-center gap-3">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      >
                        <Loader2 className="h-6 w-6 text-primary" />
                      </motion.div>
                      <h3 className="text-lg font-semibold text-primary">
                        {smartMode ? 'AI Analysis in Progress' : 'Grammar Check in Progress'}
                      </h3>
                    </div>

                    <Progress value={undefined} className="w-full h-2" />

                    <motion.div
                      animate={{ opacity: [1, 0.6, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="text-center space-y-2"
                    >
                      <p className="text-sm font-medium text-foreground">
                        {smartMode ? 'AI is analyzing your text with advanced language models...' : 'Checking grammar, spelling, and style...'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Using LanguageTool for comprehensive language analysis
                      </p>
                    </motion.div>

                    {/* Analysis steps indicator */}
                    <div className="flex justify-center gap-2 mt-4">
                      {['Parsing', 'Analysis', 'Suggestions'].map((step, index) => (
                        <motion.div
                          key={step}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border"
                          animate={{
                            backgroundColor: index === 1 ? 'hsl(var(--primary)/0.1)' : 'hsl(var(--muted)/0.5)',
                            borderColor: index === 1 ? 'hsl(var(--primary)/0.3)' : 'hsl(var(--border))'
                          }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          <div className={`w-2 h-2 rounded-full ${index === 1 ? 'bg-primary' : 'bg-muted-foreground/50'}`} />
                          <span className="text-xs font-medium">{step}</span>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Enhanced Grammar Results */}
            <AnimatePresence>
              {grammarResult && (
                <motion.div
                  initial={{ opacity: 0, y: 30, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="space-y-6"
                >
                  {/* Enhanced Summary Card */}
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className={`relative overflow-hidden rounded-xl p-6 border shadow-lg ${
                      grammarResult.error_count === 0
                        ? 'bg-gradient-to-br from-green-50 via-green-50/80 to-green-100/60 border-green-200/60'
                        : 'bg-gradient-to-br from-orange-50 via-orange-50/80 to-orange-100/60 border-orange-200/60'
                    }`}
                  >
                    {/* Success/Warning indicator */}
                    <div className="absolute top-4 right-4">
                      <motion.div
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
                        className={`p-2 rounded-full ${
                          grammarResult.error_count === 0
                            ? 'bg-green-100 dark:bg-green-900/30'
                            : 'bg-orange-100 dark:bg-orange-900/30'
                        }`}
                      >
                        {grammarResult.error_count === 0 ? (
                          <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                        ) : (
                          <AlertTriangle className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                        )}
                      </motion.div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <motion.div
                          initial={{ scale: 0, rotate: -90 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                          className={`p-3 rounded-xl border ${
                            grammarResult.error_count === 0
                              ? 'bg-green-100 border-green-200 text-green-600'
                              : 'bg-orange-100 border-orange-200 text-orange-600'
                          }`}
                        >
                          <Sparkles className="h-6 w-6" />
                        </motion.div>
                        <div>
                          <h3 className={`text-xl font-bold ${
                            grammarResult.error_count === 0 ? 'text-green-800' : 'text-orange-800'
                          }`}>
                            Analysis Complete!
                          </h3>
                          <div className="flex items-center gap-3 mt-1">
                            <span className={`text-sm font-medium ${
                              grammarResult.error_count === 0 ? 'text-green-700' : 'text-orange-700'
                            }`}>
                              {grammarResult.error_count === 0 ? 'Perfect text!' : `${grammarResult.error_count} ${grammarResult.error_count === 1 ? 'issue' : 'issues'} found`}
                            </span>
                            <span className="text-xs text-muted-foreground bg-background/60 px-2 py-1 rounded-full">
                              {grammarResult.processing_time.toFixed(2)}s
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-baseline gap-3">
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.4, type: "spring", stiffness: 200 }}
                            className={`text-4xl font-bold ${
                              grammarResult.error_count === 0 ? 'text-green-600' : 'text-orange-600'
                            }`}
                          >
                            {grammarResult.error_count}
                          </motion.span>
                          <span className="text-lg text-muted-foreground">
                            {grammarResult.error_count === 0 ? 'Issues' : grammarResult.error_count === 1 ? 'Issue' : 'Issues'}
                          </span>
                        </div>

                        {grammarResult.error_count > 0 && (
                          <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.5 }}
                          >
                            <Button
                              onClick={() => handleSelectiveCorrections(['spelling', 'punctuation'])}
                              size="sm"
                              className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 font-medium"
                            >
                              <Zap className="h-4 w-4 mr-2" />
                              Fix Safe Issues
                            </Button>
                          </motion.div>
                        )}
                      </div>
                    </div>
                  </motion.div>

                  {/* Enhanced Errors List */}
                  {grammarResult.errors.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="space-y-4 max-h-96 overflow-y-auto pr-2"
                    >
                      <div className="flex items-center gap-2 px-1">
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                        <h4 className="text-base font-semibold text-foreground">Issues Found</h4>
                      </div>

                      <div className="space-y-3">
                        {grammarResult.errors.map((error, index) => {
                          const typeInfo = {
                            spelling: { color: 'border-l-red-400 bg-red-50/50', label: 'Spelling', icon: '📝', textColor: 'text-red-700' },
                            grammar: { color: 'border-l-orange-400 bg-orange-50/50', label: 'Grammar', icon: '📚', textColor: 'text-orange-700' },
                            punctuation: { color: 'border-l-blue-400 bg-blue-50/50', label: 'Punctuation', icon: '🔤', textColor: 'text-blue-700' },
                            style: { color: 'border-l-purple-400 bg-purple-50/50', label: 'Style', icon: '✨', textColor: 'text-purple-700' },
                            default: { color: 'border-l-gray-400 bg-gray-50/50', label: 'Other', icon: '❓', textColor: 'text-gray-700' }
                          };

                          const errorType = error.error_type || 'default';
                          const info = typeInfo[errorType as keyof typeof typeInfo] || typeInfo.default;

                          return (
                            <motion.div
                              key={index}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.4 + index * 0.05 }}
                              className={`border-l-4 ${info.color} border border-border/50 rounded-r-xl p-5 hover:shadow-md transition-all duration-200 group`}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-3 mb-3">
                                    <span className="text-lg">{info.icon}</span>
                                    <div className="flex items-center gap-2">
                                      <span className={`text-xs font-bold uppercase tracking-wider ${info.textColor}`}>
                                        {info.label}
                                      </span>
                                      {error.confidence && (
                                        <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                                          {Math.round(error.confidence * 100)}% confidence
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <p className="text-sm text-foreground mb-4 leading-relaxed font-medium">
                                    {error.message}
                                  </p>

                                  {error.suggestions.length > 0 && (
                                    <div className="space-y-3">
                                      <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                        <Sparkles className="h-3 w-3" />
                                        Suggestions:
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        {error.suggestions.slice(0, 3).map((suggestion, suggestionIndex) => (
                                          <motion.div
                                            key={suggestionIndex}
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                          >
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => applyCorrection(index)}
                                              className="h-8 px-3 text-xs bg-background/80 border border-border/50 hover:bg-primary/10 hover:border-primary/30 hover:text-primary rounded-lg font-medium transition-all duration-200"
                                              title={`Apply: ${suggestion}`}
                                            >
                                              {suggestion}
                                            </Button>
                                          </motion.div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                <motion.div
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.9 }}
                                >
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => applyCorrection(index)}
                                    className="h-9 w-9 shrink-0 rounded-xl hover:bg-primary/10 hover:text-primary border border-border/30 hover:border-primary/30 transition-all duration-200"
                                    title="Apply first suggestion"
                                  >
                                    <Zap className="h-4 w-4" />
                                  </Button>
                                </motion.div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
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
    <Card className="h-fit overflow-hidden border-0 shadow-xl bg-gradient-to-br from-background via-background to-muted/20">
      <CardHeader className="pb-4 bg-gradient-to-r from-primary/5 via-primary/3 to-transparent border-b border-border/50">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20 shadow-sm">
              <Zap className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                Processing Center
              </h2>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-sm text-muted-foreground">
                  Complete OCR and grammar workflow
                </p>
                <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-muted/50 border border-border/50">
                  {isWebEnvironment ? (
                    <>
                      <Globe className="h-3 w-3 text-blue-500" />
                      <span className="text-xs font-medium">Web</span>
                    </>
                  ) : (
                    <>
                      <Monitor className="h-3 w-3 text-green-500" />
                      <span className="text-xs font-medium">Desktop</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'ocr' && currentFile?.file_type === 'Image' && (
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                  className={`h-9 w-9 rounded-xl transition-all duration-200 ${
                    showAdvancedOptions
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'hover:bg-muted/50'
                  }`}
                  title="Advanced OCR options"
                >
                  <motion.div
                    animate={{ rotate: showAdvancedOptions ? 180 : 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Settings className="h-4 w-4" />
                  </motion.div>
                </Button>
              </motion.div>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Enhanced Tab Navigation */}
        <div className="relative p-1.5 bg-gradient-to-r from-muted/80 via-muted/60 to-muted/80 rounded-xl border border-border/50 shadow-inner">
          <div className="flex gap-1">
            {tabs.map((tab, index) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <motion.div
                  key={tab.id}
                  className="flex-1 relative"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full h-12 relative overflow-hidden transition-all duration-300 ${
                      isActive
                        ? 'bg-background shadow-lg text-foreground border border-border/50 font-semibold'
                        : 'hover:bg-background/30 text-muted-foreground hover:text-foreground'
                    }`}
                    title={tab.description}
                  >
                    {/* Active tab background gradient */}
                    {isActive && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute inset-0 bg-gradient-to-br from-primary/5 via-primary/3 to-transparent rounded-md"
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      />
                    )}

                    <div className="relative z-10 flex items-center justify-center gap-2">
                      <motion.div
                        animate={{
                          scale: isActive ? 1.1 : 1,
                          rotate: isActive ? [0, -5, 5, 0] : 0
                        }}
                        transition={{
                          scale: { duration: 0.2 },
                          rotate: { duration: 0.5, repeat: isActive ? 1 : 0 }
                        }}
                      >
                        <Icon className={`h-5 w-5 ${isActive ? 'text-primary' : ''}`} />
                      </motion.div>
                      <span className={`font-medium ${
                        isSmallScreen
                          ? 'hidden xs:inline text-xs'
                          : 'text-sm'
                      }`}>
                        {getTabDisplayLabel(tab, isSmallScreen)}
                      </span>
                    </div>

                    {/* Progress indicator for completed steps */}
                    {((tab.id === 'ocr' && ocrResult) ||
                      (tab.id === 'grammar' && grammarResult) ||
                      (tab.id === 'export' && editedText)) && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full"
                      />
                    )}
                  </Button>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Enhanced Tab Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="min-h-[200px]"
          >
            {renderTabContent()}
          </motion.div>
        </AnimatePresence>

        {/* Enhanced No File Selected */}
        {!currentFile && activeTab === 'ocr' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="text-center py-12 px-6 rounded-xl bg-gradient-to-br from-muted/30 via-muted/20 to-transparent border-2 border-dashed border-border/30"
          >
            <motion.div
              animate={{
                y: [0, -8, 0],
                opacity: [0.6, 1, 0.6]
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            >
              <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
            </motion.div>
            <h3 className="text-lg font-semibold mb-2">No File Selected</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
              Upload a file in the File Upload section to begin the OCR and grammar checking process
            </p>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}