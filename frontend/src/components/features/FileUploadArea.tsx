import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, File as FileIcon, Image, Video, FileText, X, CheckCircle2, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UploadIcon } from '@/components/ui/animated-icons';
import { useFileState, useAppStore } from '@/store/app-store';
import { universalFileApi } from '@/lib/universal-file-api';
import { scaleIn } from '@/lib/micro-interactions';

export function FileUploadArea() {
  const {
    currentFile,
    setCurrentFile
  } = useFileState();
  const { setError } = useAppStore();
  const [isDragActive, setIsDragActive] = useState(false);

  const [uploadSuccess, setUploadSuccess] = useState(false);

  // Universal file handling for both desktop and web
  const handleFileSelect = useCallback(async (fileInput: string | File) => {
    try {
      console.log('Starting file selection process:', fileInput instanceof File ? fileInput.name : fileInput);
      console.log('Environment - Web:', universalFileApi.isWebEnvironment(), 'Tauri:', universalFileApi.isTauriEnvironment());

      // Validate file
      console.log('Validating file...');
      const isValid = await universalFileApi.validateFile(fileInput);
      console.log('File validation result:', isValid);

      if (!isValid) {
        console.error('File validation failed for:', fileInput instanceof File ? fileInput.name : fileInput);
        setError('Selected file is not valid or cannot be accessed');
        return;
      }

      // Check if supported
      console.log('Checking file support for:', fileInput instanceof File ? fileInput.name : fileInput);
      const isImage = await universalFileApi.isSupported(fileInput, 'image');
      const isVideo = await universalFileApi.isSupported(fileInput, 'video');
      const isDocument = await universalFileApi.isSupported(fileInput, 'document');
      const isPdf = await universalFileApi.isSupported(fileInput, 'pdf');

      console.log('File support results:', { isImage, isVideo, isDocument, isPdf });

      if (!isImage && !isVideo && !isDocument && !isPdf) {
        console.log('File extension:', universalFileApi.getFileExtension(fileInput instanceof File ? fileInput.name : fileInput));
        console.log('Supported formats:', {
          image: universalFileApi.getSupportedFormats().image,
          video: universalFileApi.getSupportedFormats().video,
          document: universalFileApi.getSupportedFormats().document,
          pdf: universalFileApi.getSupportedFormats().pdf
        });
        setError('File format not supported. Please select an image, video, document, or PDF file.');
        return;
      }

      // Get file info
      console.log('Getting file info...');
      const fileInfo = await universalFileApi.getFileInfo(fileInput);
      console.log('File info received:', fileInfo);

      // Store additional info about web files
      if (fileInput instanceof File) {
        // Store the File object in the fileInfo for later processing
        (fileInfo as any).webFile = fileInput;
        console.log('Web file stored for processing:', fileInput.name, 'File object:', fileInput);
      } else {
        console.log('Desktop file path stored:', fileInput);
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
  };

  const getFileIcon = (fileType: string) => {
    switch (fileType) {
      case 'Image': return <Image className="h-8 w-8 text-blue-500" />;
      case 'Video': return <Video className="h-8 w-8 text-purple-500" />;
      case 'Document': return <FileText className="h-8 w-8 text-green-500" />;
      case 'Pdf': return <FileText className="h-8 w-8 text-red-500" />;
      default: return <FileIcon className="h-8 w-8 text-gray-500" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    return universalFileApi.formatFileSize(bytes);
  };


  return (
    <Card className="h-fit overflow-hidden border-0 shadow-lg bg-gradient-to-br from-background via-background to-muted/20">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">File Upload</h2>
              <p className="text-xs text-muted-foreground font-normal">
                Images, videos, documents & PDFs supported
              </p>
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <AnimatePresence mode="wait">
          {!currentFile ? (
            <div {...dropzoneProps}>
              <motion.div
                key="upload"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="relative"
              >
                <motion.div
                  className={`
                    relative border-2 border-dashed rounded-xl text-center cursor-pointer transition-all duration-300
                    p-8 sm:p-10 lg:p-12 overflow-hidden
                    ${isDragActive
                      ? 'border-primary bg-gradient-to-br from-primary/10 via-primary/5 to-primary/10 shadow-lg scale-[1.02]'
                      : 'border-muted-foreground/20 hover:border-primary/40 hover:bg-gradient-to-br hover:from-primary/5 hover:to-transparent hover:shadow-md'
                    }
                  `}
                  onClick={openFilePicker}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <input {...getInputProps()} />

                  {/* Animated background pattern */}
                  <div className="absolute inset-0 opacity-5">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-primary/20" />
                    <motion.div
                      className="absolute inset-0"
                      animate={{
                        background: isDragActive
                          ? 'radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.1) 0%, transparent 70%)'
                          : 'radial-gradient(circle at 50% 50%, transparent 0%, transparent 70%)'
                      }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>

                  {/* Success state overlay */}
                  <AnimatePresence>
                    {uploadSuccess && (
                      <motion.div
                        variants={scaleIn}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-green-50 via-green-50/90 to-green-100/80 dark:from-green-950 dark:via-green-950/90 dark:to-green-900/80 rounded-xl backdrop-blur-sm"
                      >
                        <div className="text-center">
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                          >
                            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-3" />
                          </motion.div>
                          <motion.p
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="text-green-700 dark:text-green-300 font-semibold"
                          >
                            File uploaded successfully!
                          </motion.p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Main content */}
                  <motion.div
                    animate={{
                      scale: isDragActive ? 1.05 : 1,
                      y: isDragActive ? -5 : 0
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="relative z-10"
                  >
                    <motion.div
                      animate={{
                        rotate: isDragActive ? [0, -5, 5, 0] : 0,
                        scale: isDragActive ? 1.1 : 1
                      }}
                      transition={{
                        rotate: { duration: 0.5, repeat: isDragActive ? Infinity : 0 },
                        scale: { duration: 0.3 }
                      }}
                      className="mb-6"
                    >
                      <UploadIcon
                        className={`mx-auto transition-colors duration-300 ${
                          isDragActive ? 'text-primary' : 'text-muted-foreground'
                        }`}
                        size={isDragActive ? 64 : 56}
                      />
                    </motion.div>

                    <motion.h3
                      className="text-xl font-semibold mb-3"
                      animate={{
                        color: isDragActive ? "hsl(var(--primary))" : "hsl(var(--foreground))",
                        scale: isDragActive ? 1.05 : 1
                      }}
                      transition={{ duration: 0.3 }}
                    >
                      {isDragActive ? (
                        <span className="flex items-center justify-center gap-2">
                          <Sparkles className="h-5 w-5" />
                          Drop your file here
                          <Sparkles className="h-5 w-5" />
                        </span>
                      ) : (
                        'Upload File for Processing'
                      )}
                    </motion.h3>

                    <p className="text-sm text-muted-foreground mb-6 leading-relaxed max-w-md mx-auto">
                      {universalFileApi.isWebEnvironment()
                        ? 'Drag and drop a file here, or click the button below to browse your files'
                        : 'Click the button below to browse and select your files'
                      }
                    </p>

                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Button
                        variant="default"
                        size="lg"
                        className="px-8 py-3 font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
                        onClick={(e) => {
                          e.stopPropagation();
                          openFilePicker();
                        }}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Choose File
                      </Button>
                    </motion.div>

                    {/* Supported formats hint */}
                    <div className="mt-6 pt-4 border-t border-muted-foreground/10">
                      <p className="text-xs text-muted-foreground">
                        Supports: JPG, PNG, PDF, DOCX, TXT, MP4, AVI and more
                      </p>
                    </div>
                  </motion.div>
                </motion.div>
              </motion.div>
            </div>
          ) : (
            <motion.div
              key="file-info"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="space-y-6"
            >
              {/* File preview card */}
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.3 }}
                className="relative p-6 rounded-xl bg-gradient-to-br from-muted/30 via-muted/20 to-background border border-border/50 shadow-sm hover:shadow-md transition-all duration-300"
              >
                {/* Success indicator */}
                <div className="absolute top-4 right-4">
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
                    className="p-1.5 rounded-full bg-green-100 dark:bg-green-900/30"
                  >
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </motion.div>
                </div>

                <div className="flex items-start gap-4">
                  {/* Enhanced file icon */}
                  <motion.div
                    initial={{ scale: 0, rotate: -90 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                    className="p-3 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20"
                  >
                    {getFileIcon(currentFile.file_type)}
                  </motion.div>

                  {/* File details */}
                  <div className="flex-1 min-w-0 space-y-3">
                    <div>
                      <motion.h3
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.25 }}
                        className="font-semibold text-lg truncate text-foreground"
                        title={currentFile.name}
                      >
                        {currentFile.name}
                      </motion.h3>

                      <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 }}
                        className="flex items-center gap-3 mt-2"
                      >
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                          {currentFile.file_type}
                        </span>
                        <span className="text-sm text-muted-foreground font-medium">
                          {formatFileSize(currentFile.size)}
                        </span>
                      </motion.div>
                    </div>

                    {/* File metadata */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.35 }}
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span>Ready for processing</span>
                      </div>
                      {currentFile.last_modified && currentFile.last_modified !== 'Unknown' && (
                        <>
                          <span>•</span>
                          <span>Modified {new Date(currentFile.last_modified).toLocaleDateString()}</span>
                        </>
                      )}
                    </motion.div>
                  </div>
                </div>

                {/* Remove button */}
                <motion.div
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4 }}
                  className="absolute top-4 left-4"
                >
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={clearFile}
                    className="h-8 w-8 rounded-full bg-background/80 hover:bg-destructive/10 hover:text-destructive border border-border/50 shadow-sm transition-all duration-200"
                    title="Remove file"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </motion.div>
              </motion.div>

              {/* Action buttons */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="flex gap-3"
              >
                <Button
                  variant="outline"
                  onClick={openFilePicker}
                  className="flex-1 h-11 font-medium hover:bg-muted/50 transition-all duration-200"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Choose Different File
                </Button>
                <Button
                  variant="default"
                  className="px-6 h-11 font-medium shadow-md hover:shadow-lg transition-all duration-200"
                  onClick={() => {
                    // This could trigger the next step in the workflow
                    console.log('Process file:', currentFile.name);
                  }}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Process
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}