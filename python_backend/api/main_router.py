"""
Main API routes for image, batch, and document processing.
"""
import os
import time
import logging
import tempfile
import asyncio
from concurrent.futures import ThreadPoolExecutor, as_completed
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Request, Depends
from typing import Optional, List
import aiofiles

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
            
            # Case 1: File upload - optimized async handling
            if file is not None:
                # Create temporary file with proper extension
                file_extension = ""
                if file.filename:
                    file_extension = os.path.splitext(file.filename)[1].lower()
                
                # Use async context manager for better resource handling
                temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=file_extension)
                temp_file.close()  # Close the file handle immediately
                
                # Write content asynchronously for better performance
                async with aiofiles.open(temp_file.name, 'wb') as f:
                    # Read file in chunks to handle large files efficiently
                    chunk_size = 8192
                    while chunk := await file.read(chunk_size):
                        await f.write(chunk)
                
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
        
        # Process the image asynchronously for better concurrency
        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor(max_workers=1) as executor:
            result = await loop.run_in_executor(
                executor, perform_ocr_on_image, image_path, options, text_options
            )
        
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
        # Clean up temporary file asynchronously if created
        if temp_file and os.path.exists(temp_file.name):
            try:
                # Use async file deletion for better performance
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, os.unlink, temp_file.name)
            except Exception as e:
                logger.warning(f"Failed to delete temporary file {temp_file.name}: {e}")

async def _process_single_image(file_path: str, options: PreprocessingOptions, text_options: TextProcessingOptions) -> OCRResult:
    """Process a single image in a thread pool."""
    if not os.path.exists(file_path):
        return OCRResult(
            text="", confidence=0, processing_time=0, file_path=file_path, 
            success=False, error_message="File not found", engine_used="PaddleOCR"
        )
    
    # Run CPU-bound OCR processing in thread pool
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor(max_workers=4) as executor:
        result = await loop.run_in_executor(
            executor, perform_ocr_on_image, file_path, options, text_options
        )
    
    result.engine_used = "PaddleOCR"
    return result

@router.post("/ocr/batch", response_model=BatchOCRResult)
async def process_batch_ocr(request: BatchOCRRequest):
    """Processes multiple image files concurrently for improved performance."""
    start_time = time.time()
    options = request.preprocessing_options or PreprocessingOptions()
    text_options = request.text_processing_options or TextProcessingOptions()
    
    # Process images concurrently with limited concurrency
    max_concurrent = min(8, len(request.file_paths))  # Limit to prevent resource exhaustion
    semaphore = asyncio.Semaphore(max_concurrent)
    
    async def process_with_semaphore(file_path: str) -> OCRResult:
        async with semaphore:
            return await _process_single_image(file_path, options, text_options)
    
    # Execute all tasks concurrently
    tasks = [process_with_semaphore(file_path) for file_path in request.file_paths]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Handle any exceptions that occurred during processing
    processed_results = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            logger.error(f"Error processing {request.file_paths[i]}: {result}")
            processed_results.append(OCRResult(
                text="", confidence=0, processing_time=0, 
                file_path=request.file_paths[i], 
                success=False, error_message=str(result), engine_used="PaddleOCR"
            ))
        else:
            processed_results.append(result)
    
    total_time = time.time() - start_time
    files_processed = sum(1 for r in processed_results if r.success)
    files_failed = len(processed_results) - files_processed
    
    logger.info(f"Batch processed {len(request.file_paths)} files in {total_time:.2f}s (concurrent)")
    
    return BatchOCRResult(
        results=processed_results,
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