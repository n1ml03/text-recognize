"""
Data models for the Python backend service
"""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class PreprocessingOptions(BaseModel):
    enhance_contrast: bool = True
    denoise: bool = True
    threshold_method: str = "adaptive_gaussian"
    apply_morphology: bool = True


class VideoProcessingOptions(BaseModel):
    frame_interval: int = 30  # Extract every Nth frame
    similarity_threshold: float = 0.85
    min_confidence: float = 0.5
    max_frames: int = 1000  # Maximum frames to process


class VideoFrameExtractionOptions(BaseModel):
    frame_interval: int = Field(default=30, ge=1, description="Extract every Nth frame")
    output_dir: Optional[str] = Field(default=None, description="Output directory for frames")
    max_frames: int = Field(default=1000, ge=1, description="Maximum frames to extract")
    similarity_threshold: float = Field(default=0.85, ge=0.0, le=1.0, description="Skip similar frames threshold")
    enable_similarity_detection: bool = Field(default=True, description="Enable similarity detection")
    resize_max_width: int = Field(default=1920, ge=100, description="Maximum frame width")
    resize_max_height: int = Field(default=1080, ge=100, description="Maximum frame height")
    jpeg_quality: int = Field(default=85, ge=1, le=100, description="JPEG compression quality")
    batch_size: int = Field(default=10, ge=1, description="Batch size for processing")


class BoundingBox(BaseModel):
    x: int
    y: int
    width: int
    height: int


class WordDetail(BaseModel):
    text: str
    confidence: float
    bbox: BoundingBox


class OCRResult(BaseModel):
    text: str
    confidence: float
    engine_used: str = "PaddleOCR"
    processing_time: float
    word_details: List[WordDetail] = []
    word_count: int = 0
    file_path: str = ""
    success: bool = True
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = {}


class DocumentExtractionResult(BaseModel):
    text: str
    file_path: str
    file_type: str
    processing_time: float
    success: bool
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = {}


class VideoFrameExtractionRequest(BaseModel):
    file_path: str = Field(..., description="Path to the video file")
    options: Optional[VideoFrameExtractionOptions] = Field(default=None, description="Extraction options")


class BatchOCRRequest(BaseModel):
    files: List[str] = Field(..., description="List of file paths to process")
    preprocessing_options: Optional[PreprocessingOptions] = Field(default=None, description="OCR preprocessing options")
    max_file_size_mb: int = Field(default=1, description="Maximum file size in MB for batch processing")


class BatchOCRResult(BaseModel):
    results: List[OCRResult] = Field(..., description="OCR results for each file")
    total_processing_time: float = Field(..., description="Total time to process all files")
    batch_size: int = Field(..., description="Number of files processed")
    compression_ratio: Optional[float] = Field(default=None, description="Response compression ratio")
    files_processed: int = Field(..., description="Number of files successfully processed")
    files_failed: int = Field(..., description="Number of files that failed processing")


class VideoFrameExtractionResult(BaseModel):
    frame_paths: List[str] = Field(description="List of extracted frame file paths")
    output_directory: str = Field(description="Directory containing extracted frames")
    total_frames_extracted: int = Field(description="Number of frames successfully extracted")
    total_video_frames: int = Field(description="Total frames in the video")
    processing_time: float = Field(description="Time taken for extraction in seconds")
    success: bool = Field(description="Whether extraction was successful")
    error_message: Optional[str] = Field(default=None, description="Error message if extraction failed")
    metadata: Dict[str, Any] = Field(default={}, description="Additional metadata about the extraction")


class DocumentExtractionRequest(BaseModel):
    file_path: str
