"""
Data models for the Python backend service using Pydantic.
"""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

# --- Preprocessing and Processing Options ---

class PreprocessingOptions(BaseModel):
    """Options for enhancing image quality before OCR."""
    enhance_contrast: bool = Field(default=False, description="Apply CLAHE to enhance contrast.")
    denoise: bool = Field(default=False, description="Apply denoising filter.")
    threshold_method: str = Field(default="otsu", description="Thresholding method: 'adaptive_gaussian', 'otsu', 'none'.")
    apply_morphology: bool = Field(default=False, description="Apply morphological operations (closing/opening).")
    deskew: bool = Field(default=True, description="Automatically straighten skewed text images.")
    upscale: bool = Field(default=True, description="Upscale low-resolution images for better OCR.")

class TextProcessingOptions(BaseModel):
    """Options for post-processing OCR text to improve structure and readability."""
    use_advanced_processing: bool = Field(default=True, description="Enable advanced text structure processing.")
    reading_order: str = Field(default="ltr_ttb", description="Reading order pattern: 'ltr_ttb', 'rtl_ttb', 'ttb_ltr', 'ttb_rtl'.")
    enable_layout_analysis: bool = Field(default=True, description="Enable automatic layout detection (multi-column, tables, etc.).")
    preserve_line_breaks: bool = Field(default=True, description="Preserve natural line breaks in the text.")
    merge_fragmented_words: bool = Field(default=True, description="Attempt to merge fragmented words.")

class VideoProcessingOptions(BaseModel):
    """Options for processing video files to extract text."""
    frame_interval: int = Field(default=5, ge=1, description="Sample one frame every N frames initially.")
    similarity_threshold: float = Field(default=0.98, ge=0.0, le=1.0, description="SSIM threshold to skip similar frames (higher means more similar).")
    min_confidence: float = Field(default=0.6, ge=0.0, le=1.0, description="Minimum confidence score to accept OCR text from a frame.")
    max_frames: int = Field(default=1000, ge=1, description="Maximum number of unique frames to process from the video.")

# --- Core Data Structures ---

class BoundingBox(BaseModel):
    """Represents a bounding box with x, y, width, and height."""
    x: int
    y: int
    width: int
    height: int

class WordDetail(BaseModel):
    """Details of a single recognized word, including its confidence and location."""
    text: str
    confidence: float
    bbox: BoundingBox
    polygon: List[List[int]] = []  # Raw polygon coordinates from PaddleOCR

class TextLine(BaseModel):
    """Represents a complete text line detected by OCR."""
    text: str
    confidence: float
    bbox: BoundingBox
    polygon: List[List[int]]  # Polygon coordinates
    textline_orientation_angle: int = 0

# --- API Result Models ---

class OCRResult(BaseModel):
    """Structured result of an OCR operation on a single image."""
    text: str
    confidence: float
    processing_time: float
    word_details: List[WordDetail] = []
    text_lines: List[TextLine] = []  # New: Complete text lines from PaddleOCR
    word_count: int = 0
    line_count: int = 0  # New: Number of text lines detected
    file_path: Optional[str] = None
    success: bool = True
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = {}
    engine_used: Optional[str] = None
    # Raw PaddleOCR output fields
    rec_texts: List[str] = []  # Raw recognized texts
    rec_scores: List[float] = []  # Raw confidence scores  
    rec_polys: List[List[List[int]]] = []  # Raw polygon coordinates
    detection_polygons: List[List[List[int]]] = []  # Detection polygons (dt_polys)

class BatchOCRResult(BaseModel):
    """Aggregated result of a batch OCR operation."""
    results: List[OCRResult]
    total_processing_time: float
    batch_size: int
    files_processed: int
    files_failed: int

class DocumentExtractionResult(BaseModel):
    """Result of extracting plain text from a document file (PDF, DOCX, etc.)."""
    text: str
    file_path: str
    file_type: str
    processing_time: float
    success: bool
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = {}
    
class VideoOCRResult(BaseModel):
    """Structured result of an OCR operation on a video file."""
    text: str
    confidence: float
    processing_time: float
    frames_processed: int
    frames_with_text: int
    unique_text_segments: int
    success: bool = True
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = {}
    engine_used: Optional[str] = None


# --- API Request Models ---

class BatchOCRRequest(BaseModel):
    """Request model for processing multiple image files in a batch."""
    file_paths: List[str]
    preprocessing_options: Optional[PreprocessingOptions] = None
    text_processing_options: Optional[TextProcessingOptions] = None

class DocumentExtractionRequest(BaseModel):
    """Request model for extracting text from a single document."""
    file_path: str

class ImageOCRRequest(BaseModel):
    """Request model for processing a single image from a file path."""
    file_path: str
    preprocessing_options: Optional[PreprocessingOptions] = None
    text_processing_options: Optional[TextProcessingOptions] = None

class VideoOCRRequest(BaseModel):
    """Request model for processing a video file from a file path."""
    file_path: str
    video_options: Optional[VideoProcessingOptions] = None
    preprocessing_options: Optional[PreprocessingOptions] = None
