import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  Play,
  Pause,
  Square,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  Download,
  Trash2,
  Globe,
  Monitor,
  Settings,
  RotateCcw,
  Copy,
  TrendingUp,
  Timer,
  AlertTriangle,
  List
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAppStore, useExportState } from '@/store/app-store';
import type { PreprocessingOptions } from '@/lib/tauri-api';
import { universalFileApi } from '@/lib/universal-file-api';
import { streamlinedProcessor } from '@/lib/streamlined-processors';


interface BatchFile {
  id: string;
  file?: File; // Web File object
  path: string;
  name: string;
  size: number;
  type: string;
  status: 'pending' | 'processing' | 'completed' | 'error' | 'paused' | 'cancelled';
  progress: number;
  ocrResult?: string;
  grammarResult?: string;
  processingTime?: number;
  errorCount?: number;
  error?: string;
  isWebFile?: boolean;
  queuePosition?: number;
  retryCount?: number;
  startTime?: number;
  endTime?: number;
  ocrConfidence?: number;
  engineUsed?: string;
  preprocessingUsed?: PreprocessingOptions;
}

export function BatchProcessingPanel() {
  // Get file state (removed unused destructured variables)
  const { setError, preprocessingOptions } = useAppStore();
  const { addExportRecord } = useExportState();
  const [files, setFiles] = useState<BatchFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [processingMode, setProcessingMode] = useState<'sequential' | 'parallel'>('sequential');
  const [maxParallelJobs, setMaxParallelJobs] = useState(3);
  const [retryFailedFiles, setRetryFailedFiles] = useState(true);
  const [maxRetries, setMaxRetries] = useState(3);
  const [processingStats, setProcessingStats] = useState({
    totalFiles: 0,
    completed: 0,
    failed: 0,
    avgProcessingTime: 0,
    totalProcessingTime: 0,
    startTime: 0
  });

  const isWebEnvironment = universalFileApi.isWebEnvironment();

  // Enhanced drop handler for both environments
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: BatchFile[] = acceptedFiles.map((file, index) => ({
      id: `${Date.now()}-${index}`,
      file,
      path: file.name,
      name: file.name,
      size: file.size,
      type: file.type,
      status: 'pending',
      progress: 0,
      isWebFile: true,
      queuePosition: files.length + index + 1,
      retryCount: 0,
    }));
    
    setFiles(prev => {
      const updated = [...prev, ...newFiles];
      updateQueuePositions(updated);
      return updated;
    });
  }, [files.length]);

  // Universal file picker that works in both environments
  const addFilesFromPicker = async () => {
    try {
      const selected = await universalFileApi.pickFile({ multiple: true });
      
      if (selected) {
        let newFiles: BatchFile[] = [];
        
        if (isWebEnvironment && Array.isArray(selected)) {
          // Web environment - File objects
          newFiles = (selected as File[]).map((file: File, index) => ({
            id: `${Date.now()}-${index}`,
            file,
            path: file.name,
            name: file.name,
            size: file.size,
            type: file.type,
            status: 'pending' as const,
            progress: 0,
            isWebFile: true,
            queuePosition: files.length + index + 1,
            retryCount: 0,
          }));
        } else if (!isWebEnvironment && Array.isArray(selected)) {
          // Desktop environment - file paths
          newFiles = await Promise.all((selected as unknown as string[]).map(async (filePath: string, index) => {
            try {
              const fileInfo = await universalFileApi.getFileInfo(filePath);
              return {
                id: `${Date.now()}-${index}`,
                path: filePath,
                name: filePath.split('/').pop() || filePath,
                size: fileInfo.size,
                type: fileInfo.extension,
                status: 'pending' as const,
                progress: 0,
                isWebFile: false,
                queuePosition: files.length + index + 1,
                retryCount: 0,
              };
            } catch {
              return {
                id: `${Date.now()}-${index}`,
                path: filePath,
                name: filePath.split('/').pop() || filePath,
                size: 0,
                type: 'unknown',
                status: 'pending' as const,
                progress: 0,
                isWebFile: false,
                queuePosition: files.length + index + 1,
                retryCount: 0,
              };
            }
          }));
        } else if (typeof selected === 'string') {
          // Single file path (desktop)
          try {
            const fileInfo = await universalFileApi.getFileInfo(selected);
            newFiles = [{
              id: `${Date.now()}-0`,
              path: selected,
              name: selected.split('/').pop() || selected,
              size: fileInfo.size,
              type: fileInfo.extension,
              status: 'pending' as const,
              progress: 0,
              isWebFile: false,
              queuePosition: files.length + 1,
              retryCount: 0,
            }];
          } catch {
            newFiles = [{
              id: `${Date.now()}-0`,
              path: selected,
              name: selected.split('/').pop() || selected,
              size: 0,
              type: 'unknown',
              status: 'pending' as const,
              progress: 0,
              isWebFile: false,
              queuePosition: files.length + 1,
              retryCount: 0,
            }];
          }
        } else if (selected instanceof File) {
          // Single file (web)
          newFiles = [{
            id: `${Date.now()}-0`,
            file: selected,
            path: selected.name,
            name: selected.name,
            size: selected.size,
            type: selected.type,
            status: 'pending' as const,
            progress: 0,
            isWebFile: true,
            queuePosition: files.length + 1,
            retryCount: 0,
          }];
        }
        
        setFiles(prev => {
          const updated = [...prev, ...newFiles];
          updateQueuePositions(updated);
          return updated;
        });
      }
    } catch (error) {
      console.error('Error opening file picker:', error);
      setError('Failed to open file picker');
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: isWebEnvironment ? {
      'image/*': ['.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.tif', '.gif', '.webp'],
      'video/*': ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.m4v', '.3gp', '.webm', '.ogv'],
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
      'application/rtf': ['.rtf'],
      'application/vnd.oasis.opendocument.text': ['.odt'],
      'text/plain': ['.txt'],
    } : undefined,
    multiple: true,
    noClick: false,
  });

  // Queue management functions
  const updateQueuePositions = (fileList: BatchFile[]) => {
    return fileList.map((file, index) => ({
      ...file,
      queuePosition: index + 1,
    }));
  };


  const removeFile = (id: string) => {
    setFiles(prev => {
      const filtered = prev.filter(file => file.id !== id);
      return updateQueuePositions(filtered);
    });
  };

  const duplicateFile = (id: string) => {
    const originalFile = files.find(f => f.id === id);
    if (!originalFile) return;

    const duplicated: BatchFile = {
      ...originalFile,
      id: `${Date.now()}-duplicate`,
      status: 'pending',
      progress: 0,
      error: undefined,
      ocrResult: undefined,
      grammarResult: undefined,
      processingTime: undefined,
      retryCount: 0,
    };

    setFiles(prev => {
      const updated = [...prev, duplicated];
      return updateQueuePositions(updated);
    });
  };

  const retryFile = (id: string) => {
    setFiles(prev => prev.map(file => 
      file.id === id 
        ? { 
            ...file, 
            status: 'pending', 
            progress: 0, 
            error: undefined,
            retryCount: (file.retryCount || 0) + 1
          }
        : file
    ));
  };

  const clearCompleted = () => {
    setFiles(prev => {
      const filtered = prev.filter(file => file.status !== 'completed');
      return updateQueuePositions(filtered);
    });
  };

  const clearAll = () => {
    if (isProcessing) {
      setError('Cannot clear files while processing');
      return;
    }
    setFiles([]);
    setCurrentFileIndex(0);
    setProcessingStats({
      totalFiles: 0,
      completed: 0,
      failed: 0,
      avgProcessingTime: 0,
      totalProcessingTime: 0,
      startTime: 0
    });
  };

  const clearFailed = () => {
    setFiles(prev => {
      const filtered = prev.filter(file => file.status !== 'error');
      return updateQueuePositions(filtered);
    });
  };

  const retryAllFailed = () => {
    setFiles(prev => prev.map(file => 
      file.status === 'error' 
        ? { 
            ...file, 
            status: 'pending', 
            progress: 0, 
            error: undefined,
            retryCount: (file.retryCount || 0) + 1
          }
        : file
    ));
  };

  const startProcessing = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) {
      setError('No pending files to process');
      return;
    }

    setIsProcessing(true);
    setIsPaused(false);
    setCurrentFileIndex(0);
    
    const startTime = Date.now();
    setProcessingStats(prev => ({
      ...prev,
      totalFiles: pendingFiles.length,
      completed: 0,
      failed: 0,
      startTime
    }));

    try {
      if (processingMode === 'parallel') {
        await processFilesInParallel(pendingFiles);
      } else {
        await processFilesSequentially(pendingFiles);
      }
    } catch (error) {
      console.error('Batch processing failed:', error);
      setError(`Batch processing failed: ${error}`);
    } finally {
      setIsProcessing(false);
      updateProcessingStats();
    }
  };

  const processFilesSequentially = async (filesToProcess: BatchFile[]) => {
    for (let i = 0; i < filesToProcess.length; i++) {
      if (isPaused) break;
      
      setCurrentFileIndex(i);
      await processFile(filesToProcess[i].id);
      
      // Add small delay between files for better UX
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };

  const processFilesInParallel = async (filesToProcess: BatchFile[]) => {
    const semaphore = new Array(maxParallelJobs).fill(null);
    let currentIndex = 0;
    
    const processNextFile = async (): Promise<void> => {
      if (currentIndex >= filesToProcess.length || isPaused) return;
      
      const fileIndex = currentIndex++;
      const file = filesToProcess[fileIndex];
      
      try {
        await processFile(file.id);
      } catch (error) {
        console.error(`Failed to process file ${file.name}:`, error);
      }
      
      // Process next file
      await processNextFile();
    };
    
    // Start parallel processing
    await Promise.all(semaphore.map(() => processNextFile()));
  };

  const updateProcessingStats = () => {
    const completed = files.filter(f => f.status === 'completed').length;
    const failed = files.filter(f => f.status === 'error').length;
    const totalProcessingTime = files
      .filter(f => f.processingTime)
      .reduce((sum, f) => sum + (f.processingTime || 0), 0);
    const avgProcessingTime = completed > 0 ? totalProcessingTime / completed : 0;

    setProcessingStats(prev => ({
      ...prev,
      completed,
      failed,
      avgProcessingTime,
      totalProcessingTime
    }));
  };

  const pauseProcessing = () => {
    setIsPaused(true);
  };

  const resumeProcessing = async () => {
    setIsPaused(false);
    
    for (let i = currentFileIndex; i < files.length; i++) {
      if (isPaused) break;
      
      const file = files[i];
      if (file.status === 'pending') {
        setCurrentFileIndex(i);
        await processFile(file.id);
      }
    }

    setIsProcessing(false);
  };

  const stopProcessing = () => {
    setIsProcessing(false);
    setIsPaused(false);
    
    // Reset pending files
    setFiles(prev => prev.map(file => 
      file.status === 'processing' 
        ? { ...file, status: 'pending', progress: 0 }
        : file
    ));
  };

  // Universal file processing with enhanced error handling and retry logic
  const processFile = async (fileId: string): Promise<void> => {
    const file = files.find(f => f.id === fileId);
    if (!file) return;

    // Check if file should be retried
    if (file.retryCount && file.retryCount >= maxRetries && !retryFailedFiles) {
      setFiles(prev => prev.map(f => 
        f.id === fileId 
          ? { ...f, status: 'error', error: 'Maximum retries exceeded' }
          : f
      ));
      return;
    }

    // Update file status to processing
    setFiles(prev => prev.map(f => 
      f.id === fileId 
        ? { 
            ...f, 
            status: 'processing', 
            progress: 5,
            startTime: Date.now(),
            preprocessingUsed: preprocessingOptions
          }
        : f
    ));

    const startTime = Date.now();

    try {
      // Step 1: Create file info object
      setFiles(prev => prev.map(f => 
        f.id === fileId ? { ...f, progress: 20 } : f
      ));

      let fileInfo;
      if (file.isWebFile && file.file) {
        // Web file
        fileInfo = await universalFileApi.getFileInfo(file.file);
      } else {
        // Desktop file
        fileInfo = await universalFileApi.getFileInfo(file.path);
      }

      // Store web file reference for processing
      if (file.isWebFile && file.file) {
        (fileInfo as any).webFile = file.file;
      }

      // Step 2: Validate file
      setFiles(prev => prev.map(f => 
        f.id === fileId ? { ...f, progress: 30 } : f
      ));

      const isValid = await universalFileApi.validateFile(
        file.isWebFile && file.file ? file.file : file.path
      );
      
      if (!isValid) {
        throw new Error('File not found or cannot be accessed');
      }

      // Step 3: Process file based on type
      setFiles(prev => prev.map(f => 
        f.id === fileId ? { ...f, progress: 50 } : f
      ));

      const processingResult = await streamlinedProcessor.processFile(fileInfo, {
        ocr_options: {
          enhance_contrast: true,
          denoise: true,
          threshold_method: 'adaptive_gaussian',
          apply_morphology: true,
        },
      });

      const extractedText = processingResult.text;

      if (!extractedText.trim()) {
        throw new Error('No text found in the file');
      }

      // Step 4: Grammar check
      setFiles(prev => prev.map(f => 
        f.id === fileId ? { ...f, progress: 80 } : f
      ));

      const grammarResult = await streamlinedProcessor.checkGrammar(extractedText, false);
      const correctedText = grammarResult.corrected_text;

      // Step 5: Complete processing
      setFiles(prev => prev.map(f => 
        f.id === fileId ? { ...f, progress: 100 } : f
      ));

      const processingTime = (Date.now() - startTime) / 1000;

      // Update file with results
      setFiles(prev => prev.map(f => 
        f.id === fileId 
          ? { 
              ...f, 
              status: 'completed', 
              progress: 100,
              ocrResult: extractedText,
              grammarResult: correctedText,
              processingTime,
              errorCount: grammarResult.error_count,
              endTime: Date.now(),
              ocrConfidence: processingResult.confidence || 0.9,
              engineUsed: processingResult.engine_used
            }
          : f
      ));

      // Create export record if in desktop environment
      if (!isWebEnvironment) {
        try {
          const { exportApi } = await import('@/lib/tauri-api');
          const exportRecord = await exportApi.createExportRecord(
            extractedText,
            correctedText,
            grammarResult.error_count,
            processingResult.engine_used,
            processingResult.confidence || 0.9,
            processingTime,
            'Batch Processing',
            grammarResult.errors.map((e: any) => `${e.category}: ${e.message}`).join('; ')
          );

          addExportRecord(exportRecord);
        } catch (exportError) {
          console.warn('Failed to create export record:', exportError);
        }
      }

      // Update processing stats
      updateProcessingStats();

    } catch (error) {
      console.error('File processing failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Processing failed';
      
      setFiles(prev => prev.map(f => 
        f.id === fileId 
          ? { 
              ...f, 
              status: 'error', 
              progress: 0,
              error: errorMessage,
              endTime: Date.now()
            }
          : f
      ));

      // Auto-retry logic
      if (retryFailedFiles && (file.retryCount || 0) < maxRetries) {
        console.log(`Auto-retrying file ${file.name} (attempt ${(file.retryCount || 0) + 1}/${maxRetries})`);
        setTimeout(() => {
          retryFile(fileId);
          processFile(fileId);
        }, 2000); // Wait 2 seconds before retry
      }

      updateProcessingStats();
    }
  };

  // Enhanced export that works in both environments
  const exportResults = async () => {
    const completedFiles = files.filter(file => file.status === 'completed');
    if (completedFiles.length === 0) {
      setError('No completed files to export');
      return;
    }

    try {
      if (isWebEnvironment) {
        // Web environment - download CSV
        const csvContent = generateCSVContent(completedFiles);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `batch_results_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        console.log(`Downloaded results for ${completedFiles.length} files`);
      } else {
        // Desktop environment - use Tauri save dialog
        const { save } = await import('@tauri-apps/plugin-dialog');
        
        const filePath = await save({
          filters: [
            {
              name: 'CSV Files',
              extensions: ['csv'],
            },
          ],
          defaultPath: `batch_results_${new Date().toISOString().split('T')[0]}.csv`,
        });

        if (!filePath) {
          return; // User cancelled
        }

        // Create export records for all completed files
        const exportRecords = completedFiles.map(file => ({
          timestamp: new Date().toISOString(),
          original_text: file.ocrResult || '',
          corrected_text: file.grammarResult || '',
          grammar_error_count: file.errorCount || 0,
          ocr_engine: 'Batch Processing',
          ocr_confidence: 0.9,
          processing_time: file.processingTime || 0,
          source_type: 'Batch',
          error_summary: '',
        }));

        // Export using the backend CSV exporter
        const { exportApi } = await import('@/lib/tauri-api');
        await exportApi.exportMultipleToCsv(filePath, exportRecords, {
          append_mode: false,
          include_headers: true,
          max_text_length: 2000,
        });

        console.log(`Exported ${completedFiles.length} files to ${filePath}`);
      }
    } catch (error) {
      console.error('Export failed:', error);
      setError(`Export failed: ${error}`);
    }
  };

  // Generate CSV content for web environment
  const generateCSVContent = (completedFiles: BatchFile[]): string => {
    const headers = [
      'File Name',
      'Original Text',
      'Corrected Text',
      'Grammar Errors',
      'Processing Time (s)',
      'Timestamp'
    ];
    
    const rows = completedFiles.map(file => [
      `"${file.name.replace(/"/g, '""')}"`,
      `"${(file.ocrResult || '').replace(/"/g, '""')}"`,
      `"${(file.grammarResult || '').replace(/"/g, '""')}"`,
      `"${file.errorCount || 0}"`,
      `"${file.processingTime?.toFixed(2) || '0'}"`,
      `"${new Date().toISOString()}"`
    ]);
    
    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  };

  const getStatusIcon = (status: BatchFile['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-muted-foreground" />;
      case 'processing':
        return <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'paused':
        return <Pause className="h-4 w-4 text-yellow-500" />;
      case 'cancelled':
        return <Square className="h-4 w-4 text-gray-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const completedCount = files.filter(f => f.status === 'completed').length;
  const errorCount = files.filter(f => f.status === 'error').length;
  const overallProgress = files.length > 0 ? (completedCount / files.length) * 100 : 0;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Batch Processing
          </div>
          <div className="flex items-center gap-1 text-sm font-normal text-muted-foreground">
            {isWebEnvironment ? (
              <>
                <Globe className="h-4 w-4 text-blue-500" />
                Web Version
              </>
            ) : (
              <>
                <Monitor className="h-4 w-4 text-green-500" />
                Desktop Version
              </>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload Area */}
        <div className="space-y-4">
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              isDragActive ? 'border-primary bg-primary/10' : 'border-muted-foreground/25 hover:border-primary/50'
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-3">
              {isDragActive 
                ? 'Drop files here...' 
                : isWebEnvironment 
                  ? 'Drag & drop files here, or click to select'
                  : 'Click to browse for files'
              }
            </p>
            <Button 
              onClick={(e) => {
                e.stopPropagation();
                addFilesFromPicker();
              }}
              variant="outline"
              size="sm"
            >
              Browse Files
            </Button>
          </div>
        </div>

        {/* Processing Settings */}
        {files.length > 0 && (
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span className="font-medium">Processing Settings</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Processing Mode</label>
                <select
                  value={processingMode}
                  onChange={(e) => setProcessingMode(e.target.value as 'sequential' | 'parallel')}
                  className="w-full px-3 py-1.5 text-sm border rounded-md"
                  disabled={isProcessing}
                >
                  <option value="sequential">Sequential</option>
                  <option value="parallel">Parallel</option>
                </select>
              </div>
              
              {processingMode === 'parallel' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Parallel Jobs</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={maxParallelJobs}
                    onChange={(e) => setMaxParallelJobs(parseInt(e.target.value) || 3)}
                    className="w-full px-3 py-1.5 text-sm border rounded-md"
                    disabled={isProcessing}
                  />
                </div>
              )}
              
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={retryFailedFiles}
                    onChange={(e) => setRetryFailedFiles(e.target.checked)}
                    disabled={isProcessing}
                  />
                  Auto-retry failed files
                </label>
                {retryFailedFiles && (
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={maxRetries}
                    onChange={(e) => setMaxRetries(parseInt(e.target.value) || 3)}
                    className="w-full px-3 py-1.5 text-sm border rounded-md"
                    placeholder="Max retries"
                    disabled={isProcessing}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Controls */}
        {files.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {!isProcessing ? (
              <Button onClick={startProcessing} size="sm">
                <Play className="h-4 w-4 mr-2" />
                Start Processing
              </Button>
            ) : (
              <>
                {!isPaused ? (
                  <Button onClick={pauseProcessing} size="sm" variant="outline">
                    <Pause className="h-4 w-4 mr-2" />
                    Pause
                  </Button>
                ) : (
                  <Button onClick={resumeProcessing} size="sm">
                    <Play className="h-4 w-4 mr-2" />
                    Resume
                  </Button>
                )}
                <Button onClick={stopProcessing} size="sm" variant="destructive">
                  <Square className="h-4 w-4 mr-2" />
                  Stop
                </Button>
              </>
            )}
            
            <Button onClick={exportResults} size="sm" variant="outline" disabled={completedCount === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export Results
            </Button>
            
            <div className="flex items-center gap-1">
              <Button onClick={clearCompleted} size="sm" variant="outline" disabled={completedCount === 0}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Completed
              </Button>
              
              <Button onClick={clearFailed} size="sm" variant="outline" disabled={errorCount === 0}>
                <AlertTriangle className="h-4 w-4 mr-2" />
                Clear Failed
              </Button>
              
              <Button onClick={retryAllFailed} size="sm" variant="outline" disabled={errorCount === 0 || isProcessing}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Retry Failed
              </Button>
              
              <Button onClick={clearAll} size="sm" variant="outline" disabled={isProcessing}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All
              </Button>
            </div>
          </div>
        )}

        {/* Enhanced Progress Overview */}
        {files.length > 0 && (
          <div className="space-y-4">
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  <span className="font-medium">Processing Progress</span>
                </div>
                <span className="text-sm font-medium">{completedCount}/{files.length} completed</span>
              </div>
              
              <Progress value={overallProgress} className="h-2" />
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>{completedCount} completed</span>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span>{errorCount} failed</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-500" />
                  <span>{files.filter(f => f.status === 'processing').length} processing</span>
                </div>
                <div className="flex items-center gap-2">
                  <List className="h-4 w-4 text-muted-foreground" />
                  <span>{files.filter(f => f.status === 'pending').length} pending</span>
                </div>
              </div>
            </div>

            {/* Processing Statistics */}
            {(isProcessing || processingStats.completed > 0) && (
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Timer className="h-4 w-4" />
                  <span className="font-medium">Processing Statistics</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="space-y-1">
                    <div className="text-muted-foreground">Average Time</div>
                    <div className="font-medium">
                      {processingStats.avgProcessingTime > 0 
                        ? `${processingStats.avgProcessingTime.toFixed(2)}s`
                        : 'N/A'
                      }
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="text-muted-foreground">Total Time</div>
                    <div className="font-medium">
                      {processingStats.totalProcessingTime > 0 
                        ? `${processingStats.totalProcessingTime.toFixed(2)}s`
                        : 'N/A'
                      }
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="text-muted-foreground">Success Rate</div>
                    <div className="font-medium">
                      {processingStats.completed + processingStats.failed > 0 
                        ? `${Math.round((processingStats.completed / (processingStats.completed + processingStats.failed)) * 100)}%`
                        : 'N/A'
                      }
                    </div>
                  </div>
                </div>

                {isProcessing && processingStats.startTime > 0 && (
                  <div className="pt-2 border-t">
                    <div className="text-xs text-muted-foreground">
                      Session started: {new Date(processingStats.startTime).toLocaleTimeString()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* File List */}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          <AnimatePresence>
            {files.map((file) => (
              <motion.div
                key={file.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex items-center gap-3 p-3 border rounded-lg"
              >
                {getStatusIcon(file.status)}
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <div className="flex items-center gap-1">
                      {file.isWebFile && (
                        <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                          <Globe className="h-3 w-3" />
                          Web
                        </span>
                      )}
                      {file.queuePosition && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          #{file.queuePosition}
                        </span>
                      )}
                      {file.retryCount && file.retryCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
                          <RotateCcw className="h-3 w-3" />
                          {file.retryCount}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                    <span>{(file.size / 1024).toFixed(1)} KB</span>
                    <span>{file.type}</span>
                  </div>
                  
                  {file.status === 'processing' && (
                    <div className="mt-2">
                      <Progress value={file.progress} className="h-1" />
                      <p className="text-xs text-muted-foreground mt-1">{file.progress}% complete</p>
                    </div>
                  )}
                  
                  {file.status === 'completed' && (
                    <div className="mt-1 space-y-1">
                      <p className="text-xs text-green-600">
                        ✓ Processed in {file.processingTime?.toFixed(2)}s • {file.errorCount} grammar errors
                      </p>
                      {file.ocrConfidence && (
                        <p className="text-xs text-muted-foreground">
                          OCR Confidence: {(file.ocrConfidence * 100).toFixed(1)}% • Engine: {file.engineUsed}
                        </p>
                      )}
                    </div>
                  )}
                  
                  {file.status === 'error' && (
                    <div className="mt-1">
                      <p className="text-xs text-red-500">{file.error}</p>
                      {file.retryCount && file.retryCount > 0 && (
                        <p className="text-xs text-orange-500">Retry attempts: {file.retryCount}</p>
                      )}
                    </div>
                  )}
                  
                  {file.status === 'paused' && (
                    <p className="text-xs text-yellow-600 mt-1">Paused</p>
                  )}
                </div>
                
                <div className="flex items-center gap-1">
                  {file.status === 'error' && (
                    <Button
                      onClick={() => retryFile(file.id)}
                      size="sm"
                      variant="ghost"
                      title="Retry processing"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                  
                  {file.status === 'completed' && (
                    <Button
                      onClick={() => duplicateFile(file.id)}
                      size="sm"
                      variant="ghost"
                      title="Duplicate file"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                  
                  <Button
                    onClick={() => removeFile(file.id)}
                    size="sm"
                    variant="ghost"
                    disabled={isProcessing && file.status === 'processing'}
                    title="Remove file"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {files.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No files added yet</p>
            <p className="text-sm">Add files to start batch processing</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}