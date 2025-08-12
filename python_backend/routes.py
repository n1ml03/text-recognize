"""
API routes for the Python backend service
"""
import os
import logging
from fastapi import APIRouter, HTTPException
try:
    from .models import (
        VideoFrameExtractionRequest,
        VideoFrameExtractionResult,
        VideoFrameExtractionOptions
    )
    from .video_processing import extract_video_frames_standalone
except ImportError:
    # Handle case when running main.py directly
    from models import (
        VideoFrameExtractionRequest,
        VideoFrameExtractionResult,
        VideoFrameExtractionOptions
    )
    from video_processing import extract_video_frames_standalone

logger = logging.getLogger(__name__)

# Create router for video processing endpoints
video_router = APIRouter(prefix="/extract", tags=["video"])

# Supported video formats
SUPPORTED_VIDEO_FORMATS = [
    '.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm', 
    '.m4v', '.3gp', '.ogv', '.ts', '.mts', '.m2ts'
]


@video_router.post("/video-frames", response_model=VideoFrameExtractionResult)
async def extract_video_frames_endpoint(request: VideoFrameExtractionRequest):
    """
    Extract frames from a video file with configurable options
    
    This endpoint provides optimized video frame extraction with:
    - Configurable frame intervals and output directories
    - Intelligent frame sampling with similarity detection
    - Memory-efficient batch processing
    - Comprehensive error handling and metadata
    """
    try:
        # Validate file path
        if not request.file_path or not isinstance(request.file_path, str):
            raise HTTPException(status_code=400, detail="Invalid file path provided")

        # Check if file exists
        if not os.path.exists(request.file_path):
            raise HTTPException(status_code=404, detail=f"Video file not found: {request.file_path}")

        # Check file size (limit to 2GB for safety)
        try:
            file_size = os.path.getsize(request.file_path)
            max_size = 2 * 1024 * 1024 * 1024  # 2GB
            if file_size > max_size:
                raise HTTPException(
                    status_code=413, 
                    detail=f"File too large: {file_size} bytes. Maximum allowed: {max_size} bytes"
                )
        except OSError as e:
            raise HTTPException(status_code=400, detail=f"Cannot access file: {str(e)}")

        # Validate file extension
        file_ext = os.path.splitext(request.file_path)[1].lower()
        if file_ext not in SUPPORTED_VIDEO_FORMATS:
            raise HTTPException(
                status_code=400, 
                detail=f"Unsupported video format: {file_ext}. Supported formats: {', '.join(SUPPORTED_VIDEO_FORMATS)}"
            )

        # Use default options if none provided
        options = request.options or VideoFrameExtractionOptions()

        # Validate options
        if options.frame_interval < 1:
            options.frame_interval = 1
        if options.max_frames < 1:
            options.max_frames = 1
        if options.similarity_threshold < 0 or options.similarity_threshold > 1:
            options.similarity_threshold = 0.85
        if options.jpeg_quality < 1 or options.jpeg_quality > 100:
            options.jpeg_quality = 85

        logger.info(f"Starting video frame extraction for: {request.file_path}")
        logger.info(f"Options: interval={options.frame_interval}, max_frames={options.max_frames}, "
                   f"similarity_threshold={options.similarity_threshold}")

        # Extract frames using the video processing module
        result_data = extract_video_frames_standalone(request.file_path, options)

        # Convert to response model
        result = VideoFrameExtractionResult(**result_data)

        if result.success:
            logger.info(f"Successfully extracted {result.total_frames_extracted} frames in {result.processing_time:.2f}s")
        else:
            logger.error(f"Frame extraction failed: {result.error_message}")

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in video frame extraction: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@video_router.get("/video-formats")
async def get_supported_video_formats():
    """Get list of supported video formats"""
    return {
        "supported_formats": SUPPORTED_VIDEO_FORMATS,
        "description": "List of video file extensions supported for frame extraction"
    }


@video_router.get("/video-info/{file_path:path}")
async def get_video_info(file_path: str):
    """Get basic information about a video file without extracting frames"""
    try:
        import cv2
        
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"Video file not found: {file_path}")

        cap = cv2.VideoCapture(file_path)
        if not cap.isOpened():
            raise HTTPException(status_code=400, detail=f"Could not open video file: {file_path}")

        # Get video properties
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        duration = total_frames / fps if fps > 0 else 0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        cap.release()

        return {
            "file_path": file_path,
            "total_frames": total_frames,
            "fps": fps,
            "duration_seconds": duration,
            "resolution": f"{width}x{height}",
            "width": width,
            "height": height,
            "file_size": os.path.getsize(file_path)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting video info: {e}")
        raise HTTPException(status_code=500, detail=f"Error reading video file: {str(e)}")
