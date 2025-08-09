import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Copy, RotateCcw, Type } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useTextState, useOCRState, useAppStore } from '@/store/app-store';

export function TextEditor() {
  const { originalText, editedText, setEditedText } = useTextState();
  const { ocrResult } = useOCRState();
  const { setError } = useAppStore();
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

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

  const handleTextChange = (value: string) => {
    setEditedText(value);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(editedText);
      // You could add a toast notification here
      console.log('Text copied to clipboard');
    } catch (error) {
      console.error('Failed to copy text:', error);
      setError('Failed to copy text to clipboard');
    }
  };

  const resetToOriginal = () => {
    setEditedText(originalText);
  };

  const clearText = () => {
    setEditedText('');
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Text Editor
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={copyToClipboard}
              disabled={!editedText}
              className="h-8 w-8"
              title="Copy to clipboard (Ctrl+C)"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={resetToOriginal}
              disabled={!originalText || editedText === originalText}
              className="h-8 w-8"
              title="Reset to original"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </CardTitle>
        
        {/* Compact Statistics */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>{wordCount} words</span>
            <span>{charCount} chars</span>
            {originalText && editedText !== originalText && (
              <span className="text-yellow-600">• Modified</span>
            )}
          </div>
          {ocrResult && (
            <span>OCR: {(ocrResult.confidence * 100).toFixed(1)}%</span>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col space-y-4">

        {/* Text Editor - Full Height */}
        <div className="relative flex-1 flex flex-col">
          <Textarea
            value={editedText}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder={
              ocrResult 
                ? "Edit the extracted text here..." 
                : "Text will appear here after OCR processing, or you can type directly..."
            }
            className="flex-1 resize-none font-mono text-sm leading-relaxed min-h-[400px]"
          />
          
          {/* Overlay for empty state */}
          {!editedText && !ocrResult && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <div className="text-center text-muted-foreground">
                <Type className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  Process an image with OCR or start typing
                </p>
              </div>
            </motion.div>
          )}
        </div>

        {/* Quick Text Actions */}
        <div className="flex items-center justify-between bg-muted/30 rounded-lg p-2">
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditedText(editedText.toUpperCase())}
              disabled={!editedText}
              className="text-xs h-7 px-2"
            >
              ABC
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditedText(editedText.toLowerCase())}
              disabled={!editedText}
              className="text-xs h-7 px-2"
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
              className="text-xs h-7 px-2"
            >
              Abc
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditedText(editedText.replace(/\s+/g, ' ').trim())}
              disabled={!editedText}
              className="text-xs h-7 px-2"
            >
              Clean
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearText}
            disabled={!editedText}
            className="text-xs h-7 px-2 text-red-600 hover:text-red-700"
          >
            Clear All
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
