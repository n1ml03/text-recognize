"""
Main API routes for image, batch, and document processing.
"""
import os
import time
import logging
import tempfile
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Request, Depends
from typing import Optional

from models import (
    PreprocessingOptions, TextProcessingOptions, OCRResult, DocumentExtractionResult, 
    BatchOCRRequest, BatchOCRResult, DocumentExtractionRequest, ImageOCRRequest
)
from core.ocr_processor import perform_ocr_on_image
from core.document_processor import extract_text_from_document

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/ocr/image", response_model=OCRResult)
async def process_image(
    request: Request,
    # Optional parameters for multipart form
    file: Optional[UploadFile] = File(None),
    file_path: Optional[str] = Form(None),
    enhance_contrast: Optional[bool] = Form(default=True),
    denoise: Optional[bool] = Form(default=True), 
    threshold_method: Optional[str] = Form(default="adaptive_gaussian"),
    apply_morphology: Optional[bool] = Form(default=True),
    deskew: Optional[bool] = Form(default=True),
    upscale: Optional[bool] = Form(default=True),
    # Text processing options
    use_advanced_processing: Optional[bool] = Form(default=True),
    reading_order: Optional[str] = Form(default="ltr_ttb")
):
    """
    Processes an image for OCR. Accepts either:
    1. Multipart form data with file upload or file_path
    2. JSON request with ImageOCRRequest structure
    """
    start_time = time.time()
    temp_file = None
    
    try:
        content_type = request.headers.get("content-type", "")
        
        if "multipart/form-data" in content_type:
            # Handle multipart form data
            options = PreprocessingOptions(
                enhance_contrast=enhance_contrast,
                denoise=denoise,
                threshold_method=threshold_method,
                apply_morphology=apply_morphology,
                deskew=deskew,
                upscale=upscale
            )
            
            text_options = TextProcessingOptions(
                use_advanced_processing=use_advanced_processing,
                reading_order=reading_order
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
                
                image_path = temp_file.name
                
            # Case 2: File path in form
            elif file_path is not None:
                if not os.path.exists(file_path):
                    raise HTTPException(status_code=404, detail="Image file not found")
                image_path = file_path
                
            else:
                raise HTTPException(status_code=400, detail="Either 'file' or 'file_path' must be provided")
                
        elif "application/json" in content_type:
            # Handle JSON request
            body = await request.json()
            json_request = ImageOCRRequest(**body)
            
            if not os.path.exists(json_request.file_path):
                raise HTTPException(status_code=404, detail="Image file not found")
                
            image_path = json_request.file_path
            options = json_request.preprocessing_options or PreprocessingOptions()
            text_options = json_request.text_processing_options or TextProcessingOptions()
            
        else:
            raise HTTPException(status_code=400, detail="Content-Type must be multipart/form-data or application/json")
        
        # Process the image
        result = perform_ocr_on_image(image_path, options, text_options)
        result.processing_time = time.time() - start_time
        result.engine_used = "PaddleOCR"
        
        if not result.success:
            raise HTTPException(status_code=500, detail=result.error_message)
            
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing image: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing image: {str(e)}")
    finally:
        # Clean up temporary file if created
        if temp_file and os.path.exists(temp_file.name):
            try:
                os.unlink(temp_file.name)
            except Exception as e:
                logger.warning(f"Failed to delete temporary file {temp_file.name}: {e}")

@router.post("/ocr/batch", response_model=BatchOCRResult)
async def process_batch_ocr(request: BatchOCRRequest):
    """Processes multiple image files in a single batch request."""
    start_time = time.time()
    options = request.preprocessing_options or PreprocessingOptions()
    text_options = request.text_processing_options or TextProcessingOptions()
    
    results = []
    for file_path in request.file_paths:
        if os.path.exists(file_path):
            result = perform_ocr_on_image(file_path, options, text_options)
            result.engine_used = "PaddleOCR"
            results.append(result)
        else:
            results.append(OCRResult(
                text="", confidence=0, processing_time=0, file_path=file_path, 
                success=False, error_message="File not found", engine_used="PaddleOCR"
            ))
            
    total_time = time.time() - start_time
    files_processed = sum(1 for r in results if r.success)
    files_failed = len(results) - files_processed
    
    return BatchOCRResult(
        results=results,
        total_processing_time=total_time,
        batch_size=len(request.file_paths),
        files_processed=files_processed,
        files_failed=files_failed
    )

# Placeholder for document extraction
@router.post("/extract/document", response_model=DocumentExtractionResult)
async def extract_document_text(request: DocumentExtractionRequest):
    """Extracts text from a document file (PDF, DOCX, TXT, RTF)."""
    if not os.path.exists(request.file_path):
        raise HTTPException(status_code=404, detail="Document file not found")
    
    result = extract_text_from_document(request.file_path)
    
    if not result.success:
        raise HTTPException(status_code=500, detail=result.error_message)
    
    return result