import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Download, 
  FileText, 
  Save, 
  CheckCircle, 
  Loader2,
  X,
  Settings
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  useTextState, 
  useOCRState, 
  useGrammarState,
  useExportState,
  useAppStore 
} from '@/store/app-store';
import { universalFileApi } from '@/lib/universal-file-api';

interface ExportFloatingPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ExportFloatingPanel({ isOpen, onClose }: ExportFloatingPanelProps) {
  const { editedText } = useTextState();
  const { ocrResult } = useOCRState();
  const { grammarResult } = useGrammarState();
  const { isExporting, addExportRecord, setExporting } = useExportState();
  const { setError } = useAppStore();

  const [exportOptions, setExportOptions] = useState({
    appendMode: true,
    includeHeaders: true,
    maxTextLength: 1000,
  });

  const isWebEnvironment = universalFileApi.isWebEnvironment();

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
        a.download = `text-export-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // For desktop environment, use Tauri save dialog
        const { save } = await import('@tauri-apps/plugin-dialog');
        const { exportApi } = await import('@/lib/tauri-api');
        
        const filePath = await save({
          filters: [{ name: 'CSV Files', extensions: ['csv'] }],
          defaultPath: `text-export-${new Date().toISOString().split('T')[0]}.csv`,
        });

        if (!filePath) return;

        await exportApi.exportToCsv(filePath, record, {
          append_mode: exportOptions.appendMode,
          include_headers: exportOptions.includeHeaders,
          max_text_length: exportOptions.maxTextLength,
        });
      }

      addExportRecord(record);
      onClose(); // Close panel after successful export
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
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-background border border-border rounded-lg shadow-lg w-full max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Download className="h-5 w-5 text-primary" />
                Export Text
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
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
              <h4 className="font-medium text-sm flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Export Options
              </h4>
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
              <div className="text-center py-6 text-muted-foreground">
                <Download className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No text to export</p>
              </div>
            )}
          </CardContent>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
