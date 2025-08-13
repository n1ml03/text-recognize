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

# Cache settings
CACHE_MAX_SIZE = 200
CACHE_TTL_SECONDS = 3600  # 1 hour

# Preprocessing defaults
DEFAULT_IMAGE_DPI = 300
MIN_IMAGE_WIDTH_FOR_OCR = 600

# OCR model settings
# Use 'en' for English, 'vi' for Vietnamese, etc.
# PaddleOCR will automatically download the corresponding server models.

# Text post-processing configuration
USE_ADVANCED_TEXT_PROCESSING = True  # Enable advanced text structure processing
DEFAULT_READING_ORDER = "ltr_ttb"    # Default reading order: left-to-right, top-to-bottom
ENABLE_LAYOUT_ANALYSIS = True        # Enable automatic layout detection and processing