import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Eye, 
  Upload,
  Settings, 
  Loader2, 
  Image,
  CheckCircle,
  Monitor,
  Globe
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  useFileState, 
  useOCRState, 
  useTextState, 
  useAppStore 
} from '@/store/app-store';
import { streamlinedProcessor } from '@/lib/streamlined-processors';
import { universalFileApi } from '@/lib/universal-file-api';

export function OCRPanel() {
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  const { currentFile } = useFileState();
  const { 
    ocrResult, 
    preprocessingOptions, 
    isProcessingOCR, 
    setOCRResult, 
    setProcessingOCR,
    setPreprocessingOptions
  } = useOCRState();
  const { setEditedText, setOriginalText } = useTextState();
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
      setEditedText(result.text); // Auto-populate editor
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

  const updatePreprocessingOption = (key: keyof typeof preprocessingOptions, value: any) => {
    setPreprocessingOptions({ ...preprocessingOptions, [key]: value });
  };

  return (
    <Card className="h-fit">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            <span>Text Extraction</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-full">
              {isWebEnvironment ? (
                <>
                  <Globe className="h-3 w-3" />
                  Web OCR
                </>
              ) : (
                <>
                  <Monitor className="h-3 w-3" />
                  Native OCR
                </>
              )}
            </div>
            {currentFile?.file_type === 'Image' && (
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
        {/* File Info */}
        {currentFile ? (
          <div className="bg-muted/30 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <Image className="h-5 w-5 text-primary" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" title={currentFile.name}>
                  {currentFile.name}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{currentFile.file_type}</span>
                  <span>•</span>
                  <span>{(currentFile.size / 1024).toFixed(1)} KB</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed border-border rounded-lg">
            <Upload className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Upload an image to extract text</p>
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
              <div className="grid gap-2 sm:gap-3">
                <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-muted/20 transition-colors touch-target">
                  <Checkbox
                    checked={preprocessingOptions.enhance_contrast}
                    onCheckedChange={(checked) => updatePreprocessingOption('enhance_contrast', checked)}
                  />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-sm font-medium">Enhance Contrast</span>
                    <span className="text-xs text-muted-foreground">Improve text visibility</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-muted/20 transition-colors touch-target">
                  <Checkbox
                    checked={preprocessingOptions.denoise}
                    onCheckedChange={(checked) => updatePreprocessingOption('denoise', checked)}
                  />
                  <div className="flex flex-col flex-1 min-w-0">
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

        {/* Process Button - Mobile optimized */}
        <Button
          onClick={handleProcessOCR}
          disabled={!currentFile || isProcessingOCR}
          className="w-full relative overflow-hidden group touch-target"
          size="xl"
        >
          <div className="flex items-center justify-center">
            {isProcessingOCR ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                <span className="text-sm sm:text-base">Extracting text...</span>
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 mr-2 transition-transform group-hover:scale-110" />
                <span className="text-sm sm:text-base">
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
                <CheckCircle className="h-4 w-4 text-green-600" />
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
              
              {/* Quick actions for extracted text */}
              <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-800">
                <p className="text-xs text-green-700 dark:text-green-300 mb-2">
                  Text has been loaded into the editor for grammar checking
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
