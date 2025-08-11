import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileText, 
  Copy, 
  RotateCcw, 
  Type, 
  CheckCircle, 
  AlertTriangle, 
  Zap,
  Sparkles,
  X,
  Download,
  Bold,
  Italic,
  Underline
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useTextState, useOCRState, useGrammarState, useAppStore } from '@/store/app-store';
import { streamlinedProcessor } from '@/lib/streamlined-processors';
import { ExportFloatingPanel } from './ExportFloatingPanel';

interface GrammarError {
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

interface SuggestionTooltip {
  error: GrammarError;
  errorIndex: number;
  x: number;
  y: number;
  visible: boolean;
}

export function SmartTextEditor() {
  const { originalText, editedText, setEditedText } = useTextState();
  const { ocrResult } = useOCRState();
  const { 
    grammarResult, 
    isCheckingGrammar, 
    setGrammarResult, 
    setCheckingGrammar 
  } = useGrammarState();
  const { setError } = useAppStore();

  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [showSuggestion, setShowSuggestion] = useState<SuggestionTooltip | null>(null);
  const [autoCheck, setAutoCheck] = useState(true);
  const [smartMode, setSmartMode] = useState(true);
  const [showExportPanel, setShowExportPanel] = useState(false);
  
  const textareaRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const checkingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const grammarCacheRef = useRef<Map<string, any>>(new Map());
  const lastProcessedTextRef = useRef<string>('');
  const isApplyingCorrectionRef = useRef<boolean>(false);

  // Update text statistics
  useEffect(() => {
    const words = editedText.trim() ? editedText.trim().split(/\s+/).length : 0;
    const chars = editedText.length;
    setWordCount(words);
    setCharCount(chars);
  }, [editedText]);

  // Initialize edited text when OCR result changes
  useEffect(() => {
    if (ocrResult && ocrResult.text) {
      setEditedText(ocrResult.text);
    }
  }, [ocrResult, setEditedText]);

  // Optimized text highlighting with memoization and virtual rendering
  const renderHighlightedText = useCallback(() => {
    if (!grammarResult || grammarResult.errors.length === 0) {
      return editedText;
    }

    // Use cached result if text hasn't changed
    const cacheKey = `${editedText}_${grammarResult.error_count}`;
    const cachedHTML = grammarCacheRef.current.get(`highlight_${cacheKey}`);
    if (cachedHTML) {
      return cachedHTML;
    }

    let highlightedText = '';
    let lastOffset = 0;

    // Sort errors by offset to process them in order
    const sortedErrors = [...grammarResult.errors].sort((a, b) => a.offset - b.offset);

    // Optimize for performance by reducing DOM complexity
    sortedErrors.forEach((error, index) => {
      // Add text before error
      const beforeText = editedText.substring(lastOffset, error.offset);
      if (beforeText) {
        highlightedText += escapeHtml(beforeText);
      }
      
      // Add highlighted error text with optimized classes
      const errorText = editedText.substring(error.offset, error.offset + error.length);
      const errorType = error.error_type || 'default';
      const errorClass = getOptimizedErrorClass(errorType, error.confidence || 0.5);
      
      highlightedText += `<span class="${errorClass}" data-error-index="${index}" data-error-type="${errorType}">${escapeHtml(errorText)}</span>`;
      
      lastOffset = error.offset + error.length;
    });

    // Add remaining text
    const remainingText = editedText.substring(lastOffset);
    if (remainingText) {
      highlightedText += escapeHtml(remainingText);
    }
    
    // Cache the result
    grammarCacheRef.current.set(`highlight_${cacheKey}`, highlightedText);
    
    return highlightedText;
  }, [editedText, grammarResult]);

  // Optimized error class generation
  const getOptimizedErrorClass = useCallback((errorType: string, confidence: number) => {
    const baseClasses = 'underline decoration-wavy cursor-pointer transition-colors duration-200';
    const hoverClasses = 'hover:bg-gradient-to-r hover:from-yellow-50 hover:to-orange-50 dark:hover:from-yellow-900/20 dark:hover:to-orange-900/20';

    const colorMap = {
      spelling: confidence > 0.8 ? 'decoration-red-500' : 'decoration-red-400',
      grammar: confidence > 0.8 ? 'decoration-orange-500' : 'decoration-orange-400',
      punctuation: confidence > 0.8 ? 'decoration-blue-500' : 'decoration-blue-400',
      style: confidence > 0.8 ? 'decoration-purple-500' : 'decoration-purple-400',
      default: 'decoration-gray-400 dark:decoration-gray-500'
    };

    const colorClass = colorMap[errorType as keyof typeof colorMap] || colorMap.default;

    return `${baseClasses} ${colorClass} ${hoverClasses}`;
  }, []);

  // HTML escape utility for security
  const escapeHtml = useCallback((text: string): string => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }, []);

  // Track if we're currently updating content to prevent recursion
  const isUpdatingContentRef = useRef(false);

  // Function to update content while preserving cursor position
  const updateContentWithCursor = useCallback((forceUpdate = false) => {
    if (!textareaRef.current || isUpdatingContentRef.current) return;
    
    const currentText = textareaRef.current.textContent || '';
    const shouldUpdate = forceUpdate || currentText !== editedText;
    
    if (shouldUpdate) {
      isUpdatingContentRef.current = true;
      
      // Save cursor position
      const selection = window.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      let cursorOffset = 0;
      
      if (range && range.startContainer) {
        try {
          const walker = document.createTreeWalker(
            textareaRef.current,
            NodeFilter.SHOW_TEXT,
            null
          );
          
          let currentPos = 0;
          let textNode;
          
          while (textNode = walker.nextNode()) {
            if (textNode === range.startContainer) {
              cursorOffset = currentPos + range.startOffset;
              break;
            }
            currentPos += textNode.textContent?.length || 0;
          }
        } catch (error) {
          cursorOffset = editedText.length;
        }
      }
      
      // Update content
      if (grammarResult?.errors && grammarResult.errors.length > 0) {
        textareaRef.current.innerHTML = renderHighlightedText();
      } else {
        textareaRef.current.textContent = editedText;
      }
      
      // Restore cursor position
      requestAnimationFrame(() => {
        try {
          const walker = document.createTreeWalker(
            textareaRef.current!,
            NodeFilter.SHOW_TEXT,
            null
          );
          
          let currentPos = 0;
          let targetNode = null;
          let targetOffset = 0;
          let textNode;
          
          while (textNode = walker.nextNode()) {
            const nodeLength = textNode.textContent?.length || 0;
            if (currentPos + nodeLength >= cursorOffset) {
              targetNode = textNode;
              targetOffset = cursorOffset - currentPos;
              break;
            }
            currentPos += nodeLength;
          }
          
          if (targetNode && selection) {
            const newRange = document.createRange();
            const safeOffset = Math.min(targetOffset, targetNode.textContent?.length || 0);
            newRange.setStart(targetNode, safeOffset);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
          }
        } catch (error) {
          // Ignore cursor positioning errors
        }
        
        isUpdatingContentRef.current = false;
      });
    }
  }, [editedText, grammarResult, renderHighlightedText]);

  // Update content when text or grammar results change
  useEffect(() => {
    updateContentWithCursor(true);
  }, [editedText, grammarResult, updateContentWithCursor]);

  // Enhanced real-time grammar checking with intelligent caching and optimized debouncing
  useEffect(() => {
    if (editedText && autoCheck && !isApplyingCorrectionRef.current) {
      // Clear any existing timeout
      if (checkingTimeoutRef.current) {
        clearTimeout(checkingTimeoutRef.current);
      }
      
      // Check cache first
      const cacheKey = `${editedText.trim()}_${smartMode}`;
      const cachedResult = grammarCacheRef.current.get(cacheKey);
      
      if (cachedResult && editedText.trim() === lastProcessedTextRef.current) {
        setGrammarResult(cachedResult);
        return;
      }
      
      // Smart debouncing: shorter delay for small changes, longer for large ones
      const textChange = Math.abs(editedText.length - lastProcessedTextRef.current.length);
      const debounceDelay = textChange < 10 ? 300 : textChange < 50 ? 600 : 1000;
      
      // Set new timeout for grammar checking
      checkingTimeoutRef.current = setTimeout(async () => {
        if (editedText.trim() && editedText.trim() !== lastProcessedTextRef.current) {
          try {
            setCheckingGrammar(true);
            const result = await streamlinedProcessor.checkGrammar(editedText, false, smartMode);
            
            // Cache the result
            grammarCacheRef.current.set(cacheKey, result);
            
            // Limit cache size
            if (grammarCacheRef.current.size > 20) {
              const firstKey = grammarCacheRef.current.keys().next().value;
              if (firstKey) {
                grammarCacheRef.current.delete(firstKey);
              }
            }
            
            lastProcessedTextRef.current = editedText.trim();
            setGrammarResult(result);
          } catch (error) {
            console.error('Auto grammar check failed:', error);
          } finally {
            setCheckingGrammar(false);
          }
        }
        checkingTimeoutRef.current = null;
      }, debounceDelay);
    }
    
    // Cleanup function
    return () => {
      if (checkingTimeoutRef.current) {
        clearTimeout(checkingTimeoutRef.current);
        checkingTimeoutRef.current = null;
      }
    };
  }, [editedText, autoCheck, smartMode, setCheckingGrammar, setGrammarResult]);

  const handleTextChange = (value: string) => {
    // Only update if the value actually changed
    if (value !== editedText) {
      setEditedText(value);
      setShowSuggestion(null); // Hide any open suggestions
      isApplyingCorrectionRef.current = false; // Reset correction flag
    }
  };

  // Handle content change that preserves formatting
  const handleFormattedTextChange = () => {
    if (textareaRef.current && !isUpdatingContentRef.current) {
      const text = textareaRef.current.textContent || '';
      handleTextChange(text);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(editedText);
      console.log('Text copied to clipboard');
    } catch (error) {
      console.error('Failed to copy text:', error);
      setError('Failed to copy text to clipboard');
    }
  };

  const resetToOriginal = () => {
    setEditedText(originalText);
    setShowSuggestion(null);
  };

  const clearText = () => {
    setEditedText('');
    setShowSuggestion(null);
  };

  // Formatting functions
  const applyFormatting = (command: string) => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      document.execCommand(command, false);
      // Update text state after formatting
      setTimeout(() => {
        if (textareaRef.current) {
          const text = textareaRef.current.textContent || '';
          handleTextChange(text);
        }
      }, 10);
    }
  };

  const toggleBold = () => applyFormatting('bold');
  const toggleItalic = () => applyFormatting('italic');
  const toggleUnderline = () => applyFormatting('underline');

  // Enhanced apply correction with smooth transitions
  const applySuggestion = (errorIndex: number, suggestion: string) => {
    if (!grammarResult) return;
    
    isApplyingCorrectionRef.current = true;
    const error = grammarResult.errors[errorIndex];
    const beforeText = editedText.substring(0, error.offset);
    const afterText = editedText.substring(error.offset + error.length);
    const correctedText = beforeText + suggestion + afterText;
    
    // Smooth transition with optimistic UI update
    setShowSuggestion(null);
    
    // Use requestAnimationFrame for smooth update
    requestAnimationFrame(() => {
      setEditedText(correctedText);
      
      // Update grammar result to remove the applied error
      const updatedErrors = grammarResult.errors.filter((_, index) => index !== errorIndex);
      const updatedResult = {
        ...grammarResult,
        errors: updatedErrors,
        error_count: updatedErrors.length,
        corrected_text: correctedText
      };
      
      setGrammarResult(updatedResult);
      
      // Clear the applying flag after a short delay
      setTimeout(() => {
        isApplyingCorrectionRef.current = false;
      }, 100);
    });
  };

  // Dismiss error
  const dismissError = (errorIndex: number) => {
    if (!grammarResult) return;
    
    const updatedErrors = grammarResult.errors.filter((_, index) => index !== errorIndex);
    setGrammarResult({
      ...grammarResult,
      errors: updatedErrors,
      error_count: updatedErrors.length
    });
    setShowSuggestion(null);
  };

  // Enhanced Fix All with smooth batch processing
  const handleFixAllCorrections = useCallback(async () => {
    if (!grammarResult || isApplyingCorrectionRef.current) return;
    
    isApplyingCorrectionRef.current = true;
    setShowSuggestion(null);
    
    // Filter high-confidence errors that are safe to auto-correct
    const safeErrors = grammarResult.errors
      .map((error, index) => ({ error, originalIndex: index }))
      .filter(({ error }) => {
        const isSafe = ['spelling', 'punctuation'].includes(error.error_type || '') && 
                       (error.confidence || 0) > 0.8 && 
                       error.suggestions && error.suggestions.length > 0;
        return isSafe;
      })
      .sort((a, b) => b.error.offset - a.error.offset); // Sort by offset descending
    
    if (safeErrors.length === 0) {
      isApplyingCorrectionRef.current = false;
      return;
    }
    
    let correctedText = editedText;
    const appliedCorrections: number[] = [];
    
    // Apply corrections in batches for smooth performance
    try {
      for (const { error, originalIndex } of safeErrors) {
        const suggestion = error.suggestions[0];
        const startPos = error.offset;
        const endPos = startPos + error.length;
        
        if (endPos <= correctedText.length) {
          correctedText = correctedText.substring(0, startPos) + 
                         suggestion + 
                         correctedText.substring(endPos);
          appliedCorrections.push(originalIndex);
        }
        
        // Add small delay for smooth UI updates
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // Update text and grammar result
      setEditedText(correctedText);
      
      // Remove applied errors from grammar result
      const remainingErrors = grammarResult.errors.filter((_, index) => 
        !appliedCorrections.includes(index)
      );
      
      setGrammarResult({
        ...grammarResult,
        errors: remainingErrors,
        error_count: remainingErrors.length,
        corrected_text: correctedText
      });
      
    } catch (error) {
      console.error('Error applying corrections:', error);
    } finally {
      // Reset the applying flag with a delay for smooth UI
      setTimeout(() => {
        isApplyingCorrectionRef.current = false;
      }, 200);
    }
  }, [editedText, grammarResult]);

  // Handle text click for suggestions
  const handleTextClick = (event: React.MouseEvent) => {
    if (!grammarResult || !textareaRef.current) return;

    // Check if clicked on a highlighted error span
    const target = event.target as HTMLElement;
    if (target.hasAttribute('data-error-index')) {
      const errorIndex = parseInt(target.getAttribute('data-error-index') || '0', 10);
      const error = grammarResult.errors[errorIndex];
      
      if (error) {
        setShowSuggestion({
          error,
          errorIndex,
          x: event.clientX,
          y: event.clientY,
          visible: true
        });
        return;
      }
    }

    // Fallback: try to get position using selection
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setShowSuggestion(null);
      return;
    }
    
    const range = selection.getRangeAt(0);
    let clickPosition = 0;
    
    // Calculate text position considering highlighted spans
    try {
      const walker = document.createTreeWalker(
        textareaRef.current,
        NodeFilter.SHOW_TEXT,
        null
      );
      
      let currentPosition = 0;
      let textNode;
      
      while (textNode = walker.nextNode()) {
        const nodeLength = textNode.textContent?.length || 0;
        if (textNode === range.startContainer) {
          clickPosition = currentPosition + range.startOffset;
          break;
        }
        currentPosition += nodeLength;
      }
    } catch (error) {
      setShowSuggestion(null);
      return;
    }
    
    // Find error at click position
    const error = grammarResult.errors.find(
      (err) => 
        clickPosition >= err.offset && 
        clickPosition <= err.offset + err.length
    );

    if (error) {
      const errorIndex = grammarResult.errors.indexOf(error);
      
      setShowSuggestion({
        error,
        errorIndex,
        x: event.clientX,
        y: event.clientY,
        visible: true
      });
    } else {
      setShowSuggestion(null);
    }
  };



  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Smart Header */}
      <div className="flex-shrink-0 border-b border-border bg-card px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold text-foreground">Smart Text Editor</h2>
            </div>

            {/* Real-time checking indicator */}
            <div className="flex items-center gap-2">
              {isCheckingGrammar && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="flex items-center gap-1 text-xs text-muted-foreground bg-card border border-border px-2 py-1 rounded-full"
                >
                  <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse" />
                  Checking...
                </motion.div>
              )}

              {grammarResult && !isCheckingGrammar && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${
                    grammarResult.error_count === 0
                      ? 'text-foreground bg-card border-border'
                      : 'text-foreground bg-card border-border'
                  }`}
                >
                  {grammarResult.error_count === 0 ? (
                    <CheckCircle className="w-3 h-3 text-muted-foreground" />
                  ) : (
                    <AlertTriangle className="w-3 h-3 text-muted-foreground" />
                  )}
                  {grammarResult.error_count === 0 ? 'Perfect!' : `${grammarResult.error_count} issues`}
                </motion.div>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {/* Settings toggle */}
            <div className="flex items-center gap-4 mr-4 bg-card border border-border rounded-lg px-3 py-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={autoCheck}
                  onCheckedChange={setAutoCheck}
                  className="h-4 w-4"
                />
                <span className="text-sm text-foreground">Auto-check</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={smartMode}
                  onCheckedChange={setSmartMode}
                  className="h-4 w-4"
                />
                <span className="text-sm text-foreground">Smart mode</span>
              </label>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={copyToClipboard}
              disabled={!editedText}
              className="h-8 w-8"
              title="Copy to clipboard"
            >
              <Copy className="h-4 w-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={resetToOriginal}
              disabled={!originalText || editedText === originalText}
              className="touch-target-sm"
              title="Reset to original"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowExportPanel(true)}
              disabled={!editedText.trim()}
              className="touch-target-sm"
              title="Export text"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Statistics - Mobile responsive */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 lg:gap-6 mt-3 text-sm bg-card border border-border rounded-lg px-3 py-2">
          <span className="text-foreground">{wordCount} words</span>
          <span className="text-foreground">{charCount} chars</span>
          {originalText && editedText !== originalText && (
            <span className="text-muted-foreground hidden sm:inline">• Modified</span>
          )}
          {ocrResult && (
            <span className="text-foreground text-xs sm:text-sm">
              OCR: {(ocrResult.confidence * 100).toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* Main Editor Area - Mobile-first responsive */}
      <div className="flex-1 relative bg-muted/30 overflow-hidden min-h-0 editor-container" style={{ maxHeight: 'calc(100% - 68px)' }}>
        <div
          ref={editorRef}
          className="h-full p-3 sm:p-4 lg:p-6 max-h-full"
        >
          <div className="relative h-full bg-card rounded-lg border border-border shadow-mobile sm:shadow-sm overflow-hidden max-h-full">
            {/* Main content editable area with inline highlighting */}
            <div
              ref={textareaRef}
              contentEditable
              suppressContentEditableWarning={true}
              onInput={() => {
                handleFormattedTextChange();
              }}
              onClick={handleTextClick}
              onKeyDown={(e) => {
                // Handle specific key behaviors for better UX
                if (e.key === 'Tab') {
                  e.preventDefault();
                  document.execCommand('insertText', false, '  ');
                }
                // Handle bold formatting (Ctrl/Cmd + B)
                else if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
                  e.preventDefault();
                  document.execCommand('bold', false);
                }
                // Handle italic formatting (Ctrl/Cmd + I)
                else if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
                  e.preventDefault();
                  document.execCommand('italic', false);
                }
                // Handle underline formatting (Ctrl/Cmd + U)
                else if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
                  e.preventDefault();
                  document.execCommand('underline', false);
                }
              }}
              onBlur={() => {
                // Ensure content is properly synced
                handleFormattedTextChange();
              }}
              className={`
                w-full h-full resize-none border-0 bg-transparent rounded-lg
                p-3 sm:p-4 lg:p-6
                text-base sm:text-base lg:text-base leading-relaxed
                font-mono focus:outline-none focus:ring-0 relative z-10
                touch-manipulation text-foreground overflow-auto
                whitespace-pre-wrap break-words scrollbar-thin
                ${!editedText ? 'empty-editor' : ''}
              `}
              style={{
                minHeight: '100%',
                outline: 'none',
                userSelect: 'text',
                WebkitUserSelect: 'text'
              }}
              data-placeholder={
                !editedText ? (
                  ocrResult
                    ? "Edit the extracted text here. Grammar suggestions will appear as you type..."
                    : "Start typing or process an image with OCR. Grammar checking happens automatically..."
                ) : ""
              }
            />
            


            {/* Empty state */}
            {!editedText && !ocrResult && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
              >
                <div className="text-center text-muted-foreground">
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <Type className="h-12 w-12 opacity-50" />
                    <Sparkles className="h-8 w-8 opacity-30" />
                  </div>
                  <p className="text-lg mb-2">Start writing with grammar assistance</p>
                  <p className="text-sm">
                    Grammar and style suggestions appear automatically as you type
                  </p>
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* Enhanced Suggestion Tooltip with improved performance */}
        <AnimatePresence mode="wait">
          {showSuggestion && (
            <motion.div
              key={`tooltip-${showSuggestion.errorIndex}`}
              initial={{ opacity: 0, scale: 0.9, y: 15 }}
              animate={{ 
                opacity: 1, 
                scale: 1, 
                y: 0,
                transition: {
                  type: "spring",
                  stiffness: 300,
                  damping: 30,
                  mass: 0.8
                }
              }}
              exit={{ 
                opacity: 0, 
                scale: 0.95, 
                y: -10,
                transition: {
                  duration: 0.12,
                  ease: "easeIn"
                }
              }}
              className="fixed z-50 bg-card/95 backdrop-blur-sm border border-border rounded-xl shadow-2xl max-w-sm will-change-transform"
              style={{
                left: Math.min(Math.max(showSuggestion.x - 190, 20), window.innerWidth - 400),
                top: Math.max(showSuggestion.y - 140, 20),
              }}
            >
              {/* Header with enhanced gradient and error type detection */}
              <div className="bg-gradient-to-r from-muted/80 to-card/80 px-4 py-3 border-b border-border/80 rounded-t-xl backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <motion.div 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.1, type: "spring", stiffness: 400 }}
                      className={`w-2 h-2 rounded-full ${
                        showSuggestion.error.error_type === 'spelling' ? 'bg-red-400' :
                        showSuggestion.error.error_type === 'grammar' ? 'bg-orange-400' :
                        showSuggestion.error.error_type === 'punctuation' ? 'bg-blue-400' :
                        showSuggestion.error.error_type === 'style' ? 'bg-purple-400' :
                        'bg-gray-400'
                      }`}>
                    </motion.div>
                    <motion.span 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 }}
                      className="text-xs font-semibold text-foreground tracking-wide uppercase"
                    >
                      {showSuggestion.error.error_type || 'grammar'}
                    </motion.span>
                  </div>
                  
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowSuggestion(null)}
                      className="h-6 w-6 hover:bg-muted/80 rounded-full transition-colors duration-200"
                    >
                      <X className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </motion.div>
                </div>
              </div>

              {/* Content with staggered animations */}
              <div className="p-4">
                {/* Error message */}
                <motion.p 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="text-sm text-foreground mb-4 leading-relaxed font-medium"
                >
                  {showSuggestion.error.message || 'Grammar issue detected.'}
                </motion.p>

                {/* Suggestions */}
                {showSuggestion.error.suggestions.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-3"
                  >
                    <motion.p 
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.25 }}
                      className="text-xs text-muted-foreground font-medium tracking-wide uppercase"
                    >
                      Suggestions
                    </motion.p>
                    <div className="space-y-2">
                      {showSuggestion.error.suggestions.slice(0, 3).map((suggestion, index) => (
                        <motion.div
                          key={`suggestion-${index}`}
                          initial={{ opacity: 0, x: -15, scale: 0.95 }}
                          animate={{ 
                            opacity: 1, 
                            x: 0, 
                            scale: 1,
                            transition: {
                              delay: 0.3 + index * 0.08,
                              type: "spring",
                              stiffness: 300,
                              damping: 25
                            }
                          }}
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => applySuggestion(showSuggestion.errorIndex, suggestion)}
                            className="w-full justify-start text-left h-auto p-3 text-sm bg-gradient-to-r from-muted to-muted/50 hover:from-blue-50 hover:to-blue-50/50 dark:hover:from-blue-900/20 dark:hover:to-blue-900/10 hover:border-blue-200 dark:hover:border-blue-700 border border-border rounded-lg transition-all duration-300 group transform hover:scale-[1.02] active:scale-[0.98] will-change-transform"
                          >
                            <div className="flex items-center gap-3">
                              <motion.div 
                                whileHover={{ rotate: 15, scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                className="w-6 h-6 bg-gradient-to-br from-card to-muted rounded-full border border-border flex items-center justify-center group-hover:border-blue-400 dark:group-hover:border-blue-600 group-hover:from-blue-50 group-hover:to-blue-100 dark:group-hover:from-blue-900/20 dark:group-hover:to-blue-900/10 transition-all duration-300 shadow-sm"
                              >
                                <Zap className="h-3 w-3 text-muted-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-300" />
                              </motion.div>
                              <span className="font-medium text-foreground group-hover:text-blue-800 dark:group-hover:text-blue-200 transition-colors duration-300">
                                {suggestion}
                              </span>
                            </div>
                          </Button>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Actions with enhanced interactions */}
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="flex gap-2 p-4 pt-0"
              >
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1"
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dismissError(showSuggestion.errorIndex)}
                    className="w-full text-xs bg-gradient-to-r from-muted to-muted/80 border border-border hover:from-muted/80 hover:to-muted/60 hover:border-border/80 rounded-lg font-medium transition-all duration-300 shadow-sm hover:shadow"
                  >
                    Dismiss
                  </Button>
                </motion.div>
                {showSuggestion.error.suggestions.length > 0 && (
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex-1"
                  >
                    <Button
                      size="sm"
                      onClick={() => applySuggestion(showSuggestion.errorIndex, showSuggestion.error.suggestions[0])}
                      className="w-full text-xs bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg font-medium shadow-lg hover:shadow-xl transition-all duration-300 transform"
                    >
                      <motion.div
                        animate={{ rotate: [0, 15, 0] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      >
                        <Zap className="h-3 w-3 mr-1" />
                      </motion.div>
                      Apply
                    </Button>
                  </motion.div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Compact Quick Actions Footer */}
        <div className="flex-shrink-0 border-t border-border bg-card px-3 sm:px-6 py-2 sm:py-3 shadow-sm min-h-[60px] sm:min-h-[68px] toolbar-always-visible">
          <div className="flex items-center justify-between h-full">
            <div className="flex gap-1 sm:gap-1.5 flex-wrap">
              {/* Formatting buttons */}
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleBold}
                disabled={!editedText}
                className="text-xs h-7 sm:h-8 px-1.5 sm:px-2 bg-muted border border-border hover:bg-muted/80 text-foreground rounded-md font-bold"
                title="Bold (Ctrl+B)"
              >
                <Bold className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleItalic}
                disabled={!editedText}
                className="text-xs h-7 sm:h-8 px-1.5 sm:px-2 bg-muted border border-border hover:bg-muted/80 text-foreground rounded-md italic"
                title="Italic (Ctrl+I)"
              >
                <Italic className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleUnderline}
                disabled={!editedText}
                className="text-xs h-7 sm:h-8 px-1.5 sm:px-2 bg-muted border border-border hover:bg-muted/80 text-foreground rounded-md underline"
                title="Underline (Ctrl+U)"
              >
                <Underline className="h-3 w-3" />
              </Button>
              
              {/* Separator */}
              <div className="h-6 w-px bg-border mx-1" />
              
              {/* Text case buttons */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditedText(editedText.toUpperCase())}
                disabled={!editedText}
                className="text-xs h-7 sm:h-8 px-2 sm:px-3 bg-muted border border-border hover:bg-muted/80 text-foreground rounded-md font-medium"
              >
                ABC
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditedText(editedText.toLowerCase())}
                disabled={!editedText}
                className="text-xs h-7 sm:h-8 px-2 sm:px-3 bg-muted border border-border hover:bg-muted/80 text-foreground rounded-md font-medium"
              >
                abc
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditedText(
                  editedText.replace(/\b\w/g, l => l.toUpperCase())
                )}
                disabled={!editedText}
                className="text-xs h-7 sm:h-8 px-2 sm:px-3 bg-muted border border-border hover:bg-muted/80 text-foreground rounded-md font-medium"
              >
                Aa
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditedText(editedText.replace(/\s+/g, ' ').trim())}
                disabled={!editedText}
                className="text-xs h-7 sm:h-8 px-2 sm:px-3 bg-muted border border-border hover:bg-muted/80 text-foreground rounded-md font-medium"
              >
                Clean
              </Button>
            </div>

            <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
              {grammarResult && grammarResult.error_count > 0 && (
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleFixAllCorrections}
                    disabled={isApplyingCorrectionRef.current}
                    className="text-xs h-7 sm:h-8 px-2 sm:px-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-700 hover:from-blue-100 hover:to-indigo-100 dark:hover:from-blue-900/30 dark:hover:to-indigo-900/30 hover:border-blue-300 dark:hover:border-blue-600 text-blue-700 dark:text-blue-300 rounded-md font-medium transition-all duration-300 shadow-sm hover:shadow"
                  >
                    <motion.div
                      animate={{ 
                        rotate: isApplyingCorrectionRef.current ? 360 : 0,
                        scale: isApplyingCorrectionRef.current ? 1.1 : 1
                      }}
                      transition={{ 
                        duration: isApplyingCorrectionRef.current ? 1 : 0.3,
                        repeat: isApplyingCorrectionRef.current ? Infinity : 0,
                        ease: "linear"
                      }}
                    >
                      <Sparkles className="h-3 w-3 mr-1 text-blue-600 dark:text-blue-400" />
                    </motion.div>
                    <span className="hidden sm:inline">{isApplyingCorrectionRef.current ? 'Fixing...' : 'Fix All'}</span>
                    <span className="sm:hidden">{isApplyingCorrectionRef.current ? 'Fix...' : 'Fix'}</span>
                  </Button>
                </motion.div>
              )}
              
              <Button
                variant="ghost"
                size="sm"
                onClick={clearText}
                disabled={!editedText}
                className="text-xs h-7 sm:h-8 px-2 sm:px-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-700 dark:text-red-300 rounded-md font-medium"
              >
                Clear
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Export Panel */}
      <ExportFloatingPanel 
        isOpen={showExportPanel} 
        onClose={() => setShowExportPanel(false)} 
      />
    </div>
  );
}
