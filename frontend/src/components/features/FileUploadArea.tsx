import { useCallback, useState, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, File as FileIcon, Image, Video, FileText, X, CheckCircle2, Sparkles, ZoomIn, ZoomOut, RotateCw, Eye, Download } from 'lucide-react';
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
  
  // Image preview states
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewRotation, setPreviewRotation] = useState(0);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      // Generate image preview for image files
      if (isImage && fileInput instanceof File) {
        await generateImagePreview(fileInput);
      } else if (isImage && typeof fileInput === 'string') {
        // For desktop files, we'd need to handle this differently
        console.log('Desktop image preview not yet implemented');
      } else {
        setImagePreview(null);
      }

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

  // Generate image preview from File object
  const generateImagePreview = useCallback(async (file: File): Promise<void> => {
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result === 'string') {
          setImagePreview(result);
          setPreviewZoom(1);
          setPreviewRotation(0);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error generating image preview:', error);
      setImagePreview(null);
    }
  }, []);

  const clearFile = () => {
    setCurrentFile(null);
    setImagePreview(null);
    setPreviewZoom(1);
    setPreviewRotation(0);
    setShowFullPreview(false);
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

  // Enhanced preview control functions
  const handleZoomIn = useCallback(() => {
    setPreviewZoom(prev => Math.min(prev + 0.25, showFullPreview ? 5 : 3));
  }, [showFullPreview]);

  const handleZoomOut = useCallback(() => {
    setPreviewZoom(prev => Math.max(prev - 0.25, 0.25));
  }, []);

  const handleRotate = useCallback(() => {
    setPreviewRotation(prev => (prev + 90) % 360);
  }, []);

  const toggleFullPreview = useCallback(() => {
    setShowFullPreview(prev => !prev);
  }, []);

  const resetView = useCallback(() => {
    setPreviewZoom(1);
    setPreviewRotation(0);
  }, []);

  // Keyboard shortcuts for full-screen mode
  useEffect(() => {
    if (!showFullPreview) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          setShowFullPreview(false);
          break;
        case '=':
        case '+':
          e.preventDefault();
          handleZoomIn();
          break;
        case '-':
          e.preventDefault();
          handleZoomOut();
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          handleRotate();
          break;
        case '0':
          e.preventDefault();
          resetView();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showFullPreview, handleZoomIn, handleZoomOut, handleRotate, resetView]);

  // Cleanup preview when component unmounts
  useEffect(() => {
    return () => {
      if (imagePreview) {
        // Clean up blob URLs if any
        if (imagePreview.startsWith('blob:')) {
          URL.revokeObjectURL(imagePreview);
        }
      }
    };
  }, [imagePreview]);


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
              {/* Enhanced File preview card with image preview */}
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.3 }}
                className="relative rounded-xl bg-gradient-to-br from-muted/30 via-muted/20 to-background border border-border/50 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden"
              >
                {/* Remove button */}
                <motion.div
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4 }}
                  className="absolute top-4 left-4 z-20"
                >
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={clearFile}
                    className="h-8 w-8 rounded-full bg-background/80 hover:bg-destructive/10 hover:text-destructive border border-border/50 shadow-sm transition-all duration-200 backdrop-blur-sm"
                    title="Remove file"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </motion.div>

                {/* Enhanced Image Preview Section */}
                {imagePreview && currentFile.file_type === 'Image' && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.4 }}
                    className="relative"
                  >
                    {/* Adaptive Preview Container */}
                    <div className="relative w-full bg-gradient-to-br from-muted/50 to-muted/20 rounded-t-xl overflow-hidden">
                      {/* Dynamic height container that adapts to image aspect ratio */}
                      <div 
                        className="relative w-full min-h-[200px] max-h-[400px] sm:min-h-[240px] sm:max-h-[480px] flex items-center justify-center"
                        style={{
                          aspectRatio: 'auto',
                        }}
                      >
                        <motion.img
                          src={imagePreview}
                          alt={currentFile.name}
                          className="max-w-full max-h-full object-contain cursor-pointer"
                          style={{
                            transform: `scale(${previewZoom}) rotate(${previewRotation}deg)`,
                            transition: 'transform 0.3s ease-in-out',
                            width: 'auto',
                            height: 'auto',
                          }}
                          onClick={toggleFullPreview}
                          onLoad={(e) => {
                            // Calculate optimal container height based on image aspect ratio
                            const img = e.target as HTMLImageElement;
                            const container = img.parentElement;
                            if (container && img.naturalWidth && img.naturalHeight) {
                              const aspectRatio = img.naturalWidth / img.naturalHeight;
                              const containerWidth = container.clientWidth;
                              const idealHeight = Math.min(
                                containerWidth / aspectRatio,
                                window.innerWidth < 640 ? 300 : 400 // Max height based on screen size
                              );
                              const finalHeight = Math.max(idealHeight, 200); // Min height
                              container.style.height = `${finalHeight}px`;
                            }
                          }}
                          whileHover={{ 
                            scale: previewZoom * 1.02,
                            transition: { type: "spring", stiffness: 400, damping: 25 }
                          }}
                        />
                        
                        {/* Loading overlay for large images */}
                        <motion.div
                          initial={{ opacity: 1 }}
                          animate={{ opacity: 0 }}
                          transition={{ delay: 0.3, duration: 0.3 }}
                          className="absolute inset-0 flex items-center justify-center bg-muted/20 pointer-events-none"
                        >
                          <div className="text-sm text-muted-foreground">Loading preview...</div>
                        </motion.div>
                      </div>
                      
                      {/* Enhanced Preview Controls Overlay */}
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        className="absolute bottom-3 right-3 flex gap-1.5 p-1 rounded-lg bg-background/90 backdrop-blur-md border border-border/50 shadow-lg"
                      >
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={handleZoomOut}
                          disabled={previewZoom <= 0.25}
                          className="h-8 w-8 rounded-md hover:bg-muted/50 transition-colors"
                          title="Zoom out"
                        >
                          <ZoomOut className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={handleZoomIn}
                          disabled={previewZoom >= 3}
                          className="h-8 w-8 rounded-md hover:bg-muted/50 transition-colors"
                          title="Zoom in"
                        >
                          <ZoomIn className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={handleRotate}
                          className="h-8 w-8 rounded-md hover:bg-muted/50 transition-colors"
                          title="Rotate"
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                        </Button>
                        <div className="w-px bg-border/50 mx-0.5" />
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={toggleFullPreview}
                          className="h-8 w-8 rounded-md hover:bg-primary/10 hover:text-primary transition-colors"
                          title="View full size"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </motion.div>

                      {/* Enhanced Zoom indicator */}
                      {previewZoom !== 1 && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="absolute top-3 left-3 px-3 py-1.5 rounded-lg bg-background/90 backdrop-blur-md border border-border/50 shadow-lg"
                        >
                          <span className="text-xs font-semibold text-primary">
                            {Math.round(previewZoom * 100)}%
                          </span>
                        </motion.div>
                      )}

                      {/* Image dimensions info */}
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-background/90 backdrop-blur-md border border-border/50 shadow-lg"
                      >
                        <span className="text-xs text-muted-foreground font-medium">
                          {currentFile.file_type}
                        </span>
                      </motion.div>
                    </div>
                  </motion.div>
                )}

                {/* File Info Section */}
                <div className="p-6">
                  <div className="flex items-start gap-4">
                    {/* Enhanced file icon (only show if no image preview) */}
                    {(!imagePreview || currentFile.file_type !== 'Image') && (
                      <motion.div
                        initial={{ scale: 0, rotate: -90 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                        className="p-3 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20"
                      >
                        {getFileIcon(currentFile.file_type)}
                      </motion.div>
                    )}

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
                          {imagePreview && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-white-900/30 dark:text-white-400">
                              Preview Ready
                            </span>
                          )}
                        </motion.div>
                      </div>
                    </div>
                  </div>
                </div>
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
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>

      {/* Enhanced Full-screen Image Preview Modal */}
      <AnimatePresence>
        {showFullPreview && imagePreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md"
            onClick={toggleFullPreview}
          >
            {/* Responsive container for the image */}
            <div className="absolute inset-4 sm:inset-8 flex items-center justify-center">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="relative w-full h-full flex items-center justify-center overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Adaptive image container */}
                <div className="relative w-full h-full flex items-center justify-center">
                  <img
                    src={imagePreview}
                    alt={currentFile?.name || 'Preview'}
                    className="max-w-full max-h-full object-contain select-none"
                    style={{
                      transform: `scale(${previewZoom}) rotate(${previewRotation}deg)`,
                      transition: 'transform 0.3s ease-in-out',
                      transformOrigin: 'center center',
                    }}
                    draggable={false}
                  />
                </div>

                {/* Enhanced Modal Controls */}
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="absolute top-4 right-4 flex gap-2 p-2 rounded-xl bg-black/50 backdrop-blur-lg border border-white/10"
                >
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={handleZoomOut}
                    disabled={previewZoom <= 0.25}
                    className="h-10 w-10 rounded-lg bg-white/10 hover:bg-white/20 text-white border-white/20 shadow-lg disabled:opacity-30"
                    title="Zoom out"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={handleZoomIn}
                    disabled={previewZoom >= 5}
                    className="h-10 w-10 rounded-lg bg-white/10 hover:bg-white/20 text-white border-white/20 shadow-lg disabled:opacity-30"
                    title="Zoom in"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={handleRotate}
                    className="h-10 w-10 rounded-lg bg-white/10 hover:bg-white/20 text-white border-white/20 shadow-lg"
                    title="Rotate"
                  >
                    <RotateCw className="h-4 w-4" />
                  </Button>
                  <div className="w-px bg-white/20 mx-1" />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={toggleFullPreview}
                    className="h-10 w-10 rounded-lg bg-white/10 hover:bg-red-500/20 text-white border-white/20 shadow-lg"
                    title="Close"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </motion.div>

                {/* Enhanced Image info overlay */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="absolute bottom-4 left-4 right-4 flex justify-between items-end gap-4"
                >
                  <div className="px-4 py-3 rounded-xl bg-black/50 backdrop-blur-lg border border-white/10 max-w-md">
                    <h4 className="font-semibold text-sm text-white truncate" title={currentFile?.name}>
                      {currentFile?.name}
                    </h4>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-white/70">
                        {currentFile && formatFileSize(currentFile.size)}
                      </span>
                      <span className="text-xs text-white/50">•</span>
                      <span className="text-xs text-white/70">
                        {Math.round(previewZoom * 100)}% zoom
                      </span>
                      {previewRotation !== 0 && (
                        <>
                          <span className="text-xs text-white/50">•</span>
                          <span className="text-xs text-white/70">
                            {previewRotation}° rotated
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  
                  {/* Enhanced action buttons */}
                  <div className="flex gap-2">
                    {/* Reset view button */}
                    {(previewZoom !== 1 || previewRotation !== 0) && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={resetView}
                        className="h-10 w-10 rounded-lg bg-white/10 hover:bg-white/20 text-white border-white/20 shadow-lg"
                        title="Reset view"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </Button>
                    )}
                    
                    {/* Download button */}
                    {imagePreview && currentFile && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          const link = document.createElement('a');
                          link.download = currentFile.name;
                          link.href = imagePreview;
                          link.click();
                        }}
                        className="h-10 w-10 rounded-lg bg-white/10 hover:bg-white/20 text-white border-white/20 shadow-lg"
                        title="Download image"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </motion.div>

                {/* Zoom level indicator */}
                {previewZoom !== 1 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute top-4 left-4 px-4 py-2 rounded-xl bg-black/50 backdrop-blur-lg border border-white/10"
                  >
                    <span className="text-sm font-semibold text-white">
                      {Math.round(previewZoom * 100)}%
                    </span>
                  </motion.div>
                )}

                {/* Keyboard shortcuts hint */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.5, duration: 3 }}
                  className="absolute top-1/2 left-4 transform -translate-y-1/2 px-4 py-3 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 text-xs text-white/70"
                >
                  <div className="font-medium text-white/90 mb-2">Shortcuts:</div>
                  <div className="space-y-1">
                    <div><span className="font-mono text-white/90">ESC</span> Close</div>
                    <div><span className="font-mono text-white/90">+/-</span> Zoom</div>
                    <div><span className="font-mono text-white/90">R</span> Rotate</div>
                    <div><span className="font-mono text-white/90">0</span> Reset</div>
                  </div>
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}