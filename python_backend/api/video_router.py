"""
API routes dedicated to video processing.
"""
import os
import time
import logging
import tempfile
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Request
from typing import Optional

from models import PreprocessingOptions, VideoProcessingOptions, VideoOCRRequest, VideoOCRResult
from core.video_processor import process_video_for_ocr

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ocr", tags=["Video OCR"])

@router.post("/video", response_model=VideoOCRResult)
async def process_video(
    request: Request,
    # Optional parameters for multipart form
    file: Optional[UploadFile] = File(None),
    file_path: Optional[str] = Form(None),
    frame_interval: Optional[int] = Form(default=5),
    similarity_threshold: Optional[float] = Form(default=0.98),
    min_confidence: Optional[float] = Form(default=0.6),
    max_frames: Optional[int] = Form(default=1000),
    enhance_contrast: Optional[bool] = Form(default=True),
    denoise: Optional[bool] = Form(default=True),
    threshold_method: Optional[str] = Form(default="adaptive_gaussian"),
    apply_morphology: Optional[bool] = Form(default=True),
    deskew: Optional[bool] = Form(default=True),
    upscale: Optional[bool] = Form(default=True)
):
    """
    Processes a video for OCR. Accepts either:
    1. Multipart form data with file upload or file_path
    2. JSON request with VideoOCRRequest structure
    """
    start_time = time.time()
    temp_file = None
    
    try:
        content_type = request.headers.get("content-type", "")
        
        if "multipart/form-data" in content_type:
            # Handle multipart form data
            video_options = VideoProcessingOptions(
                frame_interval=frame_interval,
                similarity_threshold=similarity_threshold,
                min_confidence=min_confidence,
                max_frames=max_frames
            )
            
            ocr_options = PreprocessingOptions(
                enhance_contrast=enhance_contrast,
                denoise=denoise,
                threshold_method=threshold_method,
                apply_morphology=apply_morphology,
                deskew=deskew,
                upscale=upscale
            )
            
            # Case 1: File upload
            if file is not None:
                # Create temporary file with proper extension
                file_extension = ""
                if file.filename:
                    file_extension = os.path.splitext(file.filename)[1].lower()
                
                temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=file_extension)
                
                # Write uploaded content to temp file
                content = await file.read()
                temp_file.write(content)
                temp_file.flush()
                temp_file.close()
                
                video_path = temp_file.name
                
            # Case 2: File path in form
            elif file_path is not None:
                if not os.path.exists(file_path):
                    raise HTTPException(status_code=404, detail="Video file not found")
                video_path = file_path
                
            else:
                raise HTTPException(status_code=400, detail="Either 'file' or 'file_path' must be provided")
                
        elif "application/json" in content_type:
            # Handle JSON request
            body = await request.json()
            json_request = VideoOCRRequest(**body)
            
            if not os.path.exists(json_request.file_path):
                raise HTTPException(status_code=404, detail="Video file not found")
                
            video_path = json_request.file_path
            video_options = json_request.video_options or VideoProcessingOptions()
            ocr_options = json_request.preprocessing_options or PreprocessingOptions()
            
        else:
            raise HTTPException(status_code=400, detail="Content-Type must be multipart/form-data or application/json")
        
        # Process the video
        result = process_video_for_ocr(video_path, video_options, ocr_options)
        result.processing_time = time.time() - start_time
        result.engine_used = "PaddleOCR"
        
        if not result.success:
            raise HTTPException(status_code=500, detail=result.error_message)
            
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing video: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing video: {str(e)}")
    finally:
        # Clean up temporary file if created
        if temp_file and os.path.exists(temp_file.name):
            try:
                os.unlink(temp_file.name)
            except Exception as e:
                logger.warning(f"Failed to delete temporary file {temp_file.name}: {e}")