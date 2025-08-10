import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, File, Image, Video, FileText, X, Info, Globe, Monitor } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UploadIcon, SuccessIcon } from '@/components/ui/animated-icons';
import { useFileState, useAppStore } from '@/store/app-store';
import { universalFileApi } from '@/lib/universal-file-api';
import { useAnimationConfig } from '@/hooks/useReducedMotion';
import { scaleIn } from '@/lib/micro-interactions';

export function FileUploadArea() {
  const {
    currentFile,
    setCurrentFile
  } = useFileState();
  const { setError } = useAppStore();
  const [isDragActive, setIsDragActive] = useState(false);
  const [isWebFile, setIsWebFile] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const { shouldAnimate } = useAnimationConfig();

  // Universal file handling for both desktop and web
  const handleFileSelect = useCallback(async (fileInput: string | File) => {
    try {
      // Validate file
      const isValid = await universalFileApi.validateFile(fileInput);
      if (!isValid) {
        setError('Selected file is not valid or cannot be accessed');
        return;
      }

      // Check if supported
      const isImage = await universalFileApi.isSupported(fileInput, 'image');
      const isVideo = await universalFileApi.isSupported(fileInput, 'video');
      const isDocument = await universalFileApi.isSupported(fileInput, 'document');
      const isPdf = await universalFileApi.isSupported(fileInput, 'pdf');

      if (!isImage && !isVideo && !isDocument && !isPdf) {
        setError('File format not supported. Please select an image, video, document, or PDF file.');
        return;
      }

      // Get file info
      const fileInfo = await universalFileApi.getFileInfo(fileInput);
      
      // Store additional info about web files
      if (fileInput instanceof File) {
        setIsWebFile(true);
        // Store the File object in the store for later processing
        (fileInfo as any).webFile = fileInput;
      } else {
        setIsWebFile(false);
      }
      
      setCurrentFile(fileInfo);
      setError(null);

      // Show success animation
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 2000);
    } catch (error) {
      console.error('Error selecting file:', error);
      setError('Failed to load file information');
    }
  }, [setCurrentFile, setError]);

  // Enhanced drag and drop that works in both environments
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      console.log('File dropped:', file.name);
      
      if (universalFileApi.isWebEnvironment()) {
        // In web environment, handle the File object directly
        await handleFileSelect(file);
      } else {
        // In Tauri environment, we need to handle it differently
        // For now, show error as Tauri drag-drop needs special handling
        setError('Drag and drop is currently only supported in the web version. Please use the file picker for desktop.');
      }
    }
  }, [handleFileSelect, setError]);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    onDragEnter: () => setIsDragActive(true),
    onDragLeave: () => setIsDragActive(false),
    multiple: false,
    noClick: true, // We'll handle clicks manually
    accept: universalFileApi.isWebEnvironment() ? {
      'image/*': ['.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.tif', '.gif', '.webp'],
      'video/*': ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.m4v', '.3gp', '.webm', '.ogv'],
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
      'application/rtf': ['.rtf'],
      'application/vnd.oasis.opendocument.text': ['.odt'],
      'text/plain': ['.txt'],
    } : undefined,
  });

  const dropzoneProps = getRootProps();

  const openFilePicker = async () => {
    try {
      console.log('Opening file picker...');
      
      const selected = await universalFileApi.pickFile();
      
      if (selected) {
        // Handle different return types from pickFile
        if (Array.isArray(selected)) {
          // Multiple files selected, use the first one
          if (selected.length > 0) {
            await handleFileSelect(selected[0]);
          }
        } else {
          // Single file selected
          await handleFileSelect(selected);
        }
      } else {
        console.log('User cancelled file selection');
      }
    } catch (error) {
      console.error('Error opening file picker:', error);
      setError(`Failed to open file picker: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const clearFile = () => {
    setCurrentFile(null);
    setIsWebFile(false);
  };

  const getFileIcon = (fileType: string) => {
    switch (fileType) {
      case 'Image': return <Image className="h-8 w-8 text-blue-500" />;
      case 'Video': return <Video className="h-8 w-8 text-purple-500" />;
      case 'Document': return <FileText className="h-8 w-8 text-green-500" />;
      case 'Pdf': return <FileText className="h-8 w-8 text-red-500" />;
      default: return <File className="h-8 w-8 text-gray-500" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    return universalFileApi.formatFileSize(bytes);
  };

  const getEnvironmentIcon = () => {
    if (universalFileApi.isWebEnvironment()) {
      return <Globe className="h-4 w-4 text-blue-500" />;
    } else {
      return <Monitor className="h-4 w-4 text-green-500" />;
    }
  };

  const getEnvironmentText = () => {
    if (universalFileApi.isWebEnvironment()) {
      return 'Web Version';
    } else {
      return 'Desktop Version';
    }
  };

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            File Upload
          </div>
          <div className="flex items-center gap-1 text-sm font-normal text-muted-foreground">
            {getEnvironmentIcon()}
            {getEnvironmentText()}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <AnimatePresence mode="wait">
          {!currentFile ? (
            <div {...dropzoneProps}>
              <motion.div
                key="upload"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`
                  border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors
                  p-4 sm:p-6 lg:p-8
                  ${isDragActive
                    ? 'border-primary bg-primary/5'
                    : 'border-muted-foreground/25 hover:border-primary/50 active:border-primary/70'
                  }
                `}
                onClick={openFilePicker}
              >
              <input {...getInputProps()} />
              <motion.div
                animate={{ scale: isDragActive ? 1.05 : 1 }}
                transition={shouldAnimate ? { type: "spring", stiffness: 300, damping: 20 } : { duration: 0.01 }}
              >
                {/* Success state */}
                <AnimatePresence>
                  {uploadSuccess && (
                    <motion.div
                      variants={scaleIn}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      className="absolute inset-0 flex items-center justify-center bg-green-50 dark:bg-green-950 rounded-lg"
                    >
                      <div className="text-center">
                        <SuccessIcon size={48} className="mx-auto mb-2" />
                        <p className="text-green-600 dark:text-green-400 font-medium">File uploaded successfully!</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <UploadIcon
                  className="mx-auto mb-3 sm:mb-4 text-muted-foreground"
                  size={isDragActive ? 56 : 48}
                />
                <motion.h3
                  className="text-base sm:text-lg font-medium mb-2"
                  animate={{ color: isDragActive ? "hsl(var(--primary))" : "hsl(var(--foreground))" }}
                  transition={{ duration: shouldAnimate ? 0.2 : 0.01 }}
                >
                  {isDragActive ? 'Drop file here' : 'Upload File for Processing'}
                </motion.h3>
                <p className="text-sm text-muted-foreground mb-3 sm:mb-4 leading-relaxed">
                  {universalFileApi.isWebEnvironment()
                    ? 'Drag and drop a file here, or click to browse'
                    : 'Click to browse for files'
                  }
                </p>
                <Button
                  variant="outline"
                  size="lg"
                  className="mb-3 sm:mb-4 touch-target w-full sm:w-auto"
                  onClick={(e) => {
                    e.stopPropagation();
                    openFilePicker();
                  }}
                >
                  Choose File
                </Button>
              </motion.div>
              </motion.div>
            </div>
          ) : (
            <motion.div
              key="file-info"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {getFileIcon(currentFile.file_type)}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate text-sm sm:text-base">{currentFile.name}</h3>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <p className="text-sm text-muted-foreground">
                        {formatFileSize(currentFile.size)} • {currentFile.file_type}
                      </p>
                      {isWebFile && (
                        <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                          <Globe className="h-3 w-3" />
                          Web File
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {currentFile.last_modified && currentFile.last_modified !== 'Unknown'
                        ? `Modified: ${new Date(currentFile.last_modified).toLocaleDateString()}`
                        : 'File ready for processing'
                      }
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={clearFile}
                  className="text-muted-foreground hover:text-destructive touch-target-sm flex-shrink-0"
                  title="Remove file"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-sm">
                  <Info className="h-4 w-4 text-blue-500" />
                  <span className="font-medium">
                    {isWebFile ? 'File Name:' : 'File Path:'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 font-mono break-all">
                  {isWebFile ? currentFile.name : currentFile.path}
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={openFilePicker} className="flex-1">
                  Choose Different File
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}