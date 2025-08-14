"""
Configuration constants for the PaddleOCR service
"""
# Supported file formats
SUPPORTED_IMAGE_FORMATS = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif', '.webp']
SUPPORTED_VIDEO_FORMATS = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm', '.m4v']
SUPPORTED_DOCUMENT_FORMATS = ['.pdf', '.docx', '.txt', '.rtf']

# File and request limits
MAX_FILE_SIZE_MB = 200
MAX_BATCH_SIZE = 50

# OCR processing parameters
SIMILARITY_THRESHOLD = 0.98  # For SSIM video frame comparison
MIN_OCR_CONFIDENCE = 0.5

# Cache settings - optimized for performance
CACHE_MAX_SIZE = 500  # Increased cache size for better hit rates
CACHE_TTL_SECONDS = 7200  # 2 hours - longer cache retention

# Performance settings
MAX_CONCURRENT_REQUESTS = 8  # Maximum concurrent OCR processing
REQUEST_TIMEOUT_SECONDS = 30  # Timeout for individual requests
BATCH_PROCESSING_CHUNK_SIZE = 4  # Process batches in chunks

# Preprocessing defaults - optimized
DEFAULT_IMAGE_DPI = 300
MIN_IMAGE_WIDTH_FOR_OCR = 800  # Increased for better OCR accuracy
MAX_IMAGE_DIMENSION = 4096  # Prevent memory issues with very large images

# Performance monitoring
SLOW_REQUEST_THRESHOLD = 2.0  # Log requests taking longer than this
CACHE_CLEANUP_PROBABILITY = 0.01  # 1% chance per request

# OCR model settings
# Use 'en' for English, 'vi' for Vietnamese, etc.
# PaddleOCR will automatically download the corresponding server models.

# Text post-processing configuration
USE_ADVANCED_TEXT_PROCESSING = True  # Enable advanced text structure processing
DEFAULT_READING_ORDER = "ltr_ttb"    # Default reading order: left-to-right, top-to-bottom
ENABLE_LAYOUT_ANALYSIS = True        # Enable automatic layout detection and processing