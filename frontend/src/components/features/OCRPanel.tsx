import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye,
  Upload,
  Settings,
  Loader2,
  Image,
  CheckCircle} from 'lucide-react';
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
import { staggerContainer, staggerItem } from '@/lib/micro-interactions';

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
      const ocrResultData = await streamlinedProcessor.processFileForUI(currentFile, {
        ocr_options: preprocessingOptions,
      });

      // Adjust processing time to seconds for display
      ocrResultData.processing_time = ocrResultData.processing_time / 1000;

      setOCRResult(ocrResultData);
      setOriginalText(ocrResultData.text);
      setEditedText(ocrResultData.text); // Auto-populate editor
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

  const updatePreprocessingOption = (key: keyof typeof preprocessingOptions, value: any) => {
    setPreprocessingOptions({ ...preprocessingOptions, [key]: value });
  };

  return (
    <Card className="h-fit overflow-hidden border-0 shadow-lg bg-gradient-to-br from-background via-background to-muted/10">
      <CardHeader className="pb-4 bg-gradient-to-r from-primary/5 via-primary/3 to-transparent">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20">
              <Eye className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Text Extraction</h2>
              <p className="text-xs text-muted-foreground font-normal">
                Process OCR with PaddleOCR
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {currentFile?.file_type === 'Image' && (
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
        {/* File Info */}
        {currentFile ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative p-5 rounded-xl bg-gradient-to-br from-muted/40 via-muted/20 to-background border border-border/50 shadow-sm"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
                <Image className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-base font-semibold truncate text-foreground" title={currentFile.name}>
                  {currentFile.name}
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                    {currentFile.file_type}
                  </span>
                  <span className="text-sm text-muted-foreground font-medium">
                    {(currentFile.size / 1024).toFixed(1)} KB
                  </span>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-xs text-muted-foreground">Ready</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-12 px-6 border-2 border-dashed border-border/30 rounded-xl bg-gradient-to-br from-muted/20 to-transparent"
          >
            <motion.div
              animate={{
                y: [0, -5, 0],
                opacity: [0.5, 0.8, 0.5]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            >
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground/60" />
            </motion.div>
            <h3 className="text-lg font-medium mb-2">No File Selected</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
              Upload an image, video, or PDF file to extract text using advanced OCR technology
            </p>
          </motion.div>
        )}

        {/* Advanced Options */}
        <AnimatePresence>
          {showAdvancedOptions && currentFile?.file_type === 'Image' && (
            <motion.div
              initial={{ height: 0, opacity: 0, y: -20 }}
              animate={{ height: 'auto', opacity: 1, y: 0 }}
              exit={{ height: 0, opacity: 0, y: -20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div className="p-6 rounded-xl bg-gradient-to-br from-muted/40 via-muted/20 to-background border border-border/50 shadow-sm">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                  className="flex items-center gap-3 mb-5"
                >
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <Settings className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-base">Image Preprocessing</h4>
                    <p className="text-xs text-muted-foreground">Optimize image quality for better OCR results</p>
                  </div>
                </motion.div>

                <motion.div
                  variants={staggerContainer}
                  initial="initial"
                  animate="animate"
                  className="space-y-4"
                >
                  {[
                    {
                      key: 'enhance_contrast',
                      title: 'Enhance Contrast',
                      description: 'Improve text visibility and clarity',
                      icon: '🔆',
                      checked: preprocessingOptions.enhance_contrast
                    },
                    {
                      key: 'denoise',
                      title: 'Noise Reduction',
                      description: 'Remove image artifacts and grain',
                      icon: '✨',
                      checked: preprocessingOptions.denoise
                    },
                    {
                      key: 'apply_morphology',
                      title: 'Morphological Operations',
                      description: 'Clean up and refine text shapes',
                      icon: '🔧',
                      checked: preprocessingOptions.apply_morphology
                    }
                  ].map((option) => (
                    <motion.label
                      key={option.key}
                      variants={staggerItem}
                      className="flex items-center gap-4 cursor-pointer p-4 rounded-xl hover:bg-muted/30 transition-all duration-200 border border-transparent hover:border-border/30 group"
                    >
                      <Checkbox
                        checked={option.checked}
                        onCheckedChange={(checked) => updatePreprocessingOption(option.key as keyof typeof preprocessingOptions, checked)}
                        className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      />
                      <div className="flex items-center gap-3 flex-1">
                        <span className="text-lg">{option.icon}</span>
                        <div className="flex-1">
                          <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                            {option.title}
                          </span>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {option.description}
                          </p>
                        </div>
                      </div>
                    </motion.label>
                  ))}
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Process Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Button
            onClick={handleProcessOCR}
            disabled={!currentFile || isProcessingOCR}
            variant="outline"
            className="w-full h-11 font-medium hover:bg-muted/50 transition-all duration-200"
          >
            {isProcessingOCR ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <Loader2 className="h-4 w-4 mr-2" />
                </motion.div>
                <span>Extracting text...</span>
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 mr-2" />
                <span>
                  {!currentFile ? 'Select File First' : 'Extract Text'}
                </span>
              </>
            )}
          </Button>
        </motion.div>

        {/* Processing Progress */}
        <AnimatePresence>
          {isProcessingOCR && (
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
                  <h3 className="text-lg font-semibold text-primary">Processing Image</h3>
                </div>

                <Progress value={undefined} className="w-full h-1" />

                <motion.div
                  animate={{ opacity: [1, 0.6, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="text-center space-y-2"
                >
                  <p className="text-xs text-muted-foreground">
                    Using advanced PaddleOCR technology for optimal accuracy
                  </p>
                </motion.div>

                {/* Processing steps indicator */}
                <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2 mt-4 px-2">
                  {[
                    { name: 'Preprocessing', short: 'Preprocessing' },
                    { name: 'Detection', short: 'Detection' },
                    { name: 'Recognition', short: 'Recognition' }
                  ].map((step, index) => (
                    <motion.div
                      key={step.name}
                      className="flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-muted/50 border flex-shrink-0 min-w-0"
                      animate={{
                        backgroundColor: index === 1 ? 'hsl(var(--primary)/0.1)' : 'hsl(var(--muted)/0.5)',
                        borderColor: index === 1 ? 'hsl(var(--primary)/0.3)' : 'hsl(var(--border))'
                      }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full flex-shrink-0 ${index === 1 ? 'bg-primary' : 'bg-muted-foreground/50'}`} />
                      <span className="text-xs font-medium whitespace-nowrap">
                        <span className="hidden xs:inline">{step.name}</span>
                        <span className="xs:hidden">{step.short}</span>
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* OCR Results */}
        <AnimatePresence>
          {ocrResult && (
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="relative overflow-hidden rounded-xl bg-card border border-border shadow-lg"
            >
              {/* Success header */}
              <div className="p-6 pb-4">
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  className="flex items-center gap-3 mb-4"
                >
                  <div className="p-2 rounded-full bg-green-50 dark:bg-white-900/50">
                    <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg text-foreground">
                      Text Extracted Successfully!
                    </h3>
                  </div>
                </motion.div>

                {/* Stats grid */}
                <motion.div
                  variants={staggerContainer}
                  initial="initial"
                  animate="animate"
                  className="grid grid-cols-2 gap-4"
                >
                  {[
                    {
                      label: 'Engine',
                      value: ocrResult.engine_used,
                      icon: '🤖',
                      color: 'text-blue-600 dark:text-blue-400'
                    },
                    {
                      label: 'Confidence',
                      value: `${(ocrResult.confidence * 100).toFixed(1)}%`,
                      icon: '🎯',
                      color: 'text-green-600 dark:text-green-400',
                      progress: ocrResult.confidence * 100
                    },
                    {
                      label: 'Processing Time',
                      value: `${ocrResult.processing_time.toFixed(2)}s`,
                      icon: '⚡',
                      color: 'text-orange-600 dark:text-orange-400'
                    },
                    {
                      label: 'Words Detected',
                      value: ocrResult.word_details.length.toString(),
                      icon: '📝',
                      color: 'text-purple-600 dark:text-purple-400'
                    }
                  ].map((stat) => (
                    <motion.div
                      key={stat.label}
                      variants={staggerItem}
                      className="p-4 rounded-xl bg-muted/30 border border-border"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{stat.icon}</span>
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {stat.label}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <p className={`font-bold text-lg ${stat.color}`} title={stat.value}>
                          {stat.value}
                        </p>
                        {/* {stat.progress && (
                          <div className="w-full bg-muted rounded-full h-2">
                            <motion.div
                              className="bg-green-600 dark:bg-green-400 h-2 rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${stat.progress}%` }}
                              transition={{ delay: 0.5 + index * 0.1, duration: 0.8, ease: "easeOut" }}
                            />
                          </div>
                        )} */}
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
