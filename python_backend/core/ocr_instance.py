"""
Optimized PaddleOCR instance management with efficient initialization and warmup.
"""
import logging
import sys
import os
import threading
import time
import numpy as np
import cv2
import tempfile
from typing import Optional, Any
from paddleocr import PaddleOCR

logger = logging.getLogger(__name__)

# Global variables for OCR instance management
ocr_instance: Optional[Any] = None
ocr_lock = threading.RLock()
initialization_time: Optional[float] = None
warmup_completed = False

def _create_optimized_warmup_images():
    """Create a set of optimized warmup images for better model initialization."""
    warmup_images = []
    
    # 1. Simple text image
    img1 = np.ones((100, 400, 3), dtype=np.uint8) * 255
    cv2.putText(img1, "WARMUP TEST", (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
    warmup_images.append(img1)
    
    # 2. Multi-line text image
    img2 = np.ones((150, 400, 3), dtype=np.uint8) * 255
    cv2.putText(img2, "Line 1", (50, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
    cv2.putText(img2, "Line 2", (50, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
    cv2.putText(img2, "Line 3", (50, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
    warmup_images.append(img2)
    
    return warmup_images

def initialize_ocr():
    """
    Optimized PaddleOCR initialization with efficient warmup and error handling.
    """
    global ocr_instance, initialization_time, warmup_completed
    
    with ocr_lock:
        if ocr_instance is not None:
            logger.info("OCR instance already initialized.")
            return

        start_time = time.time()
        
        try:
            logger.info("Initializing PaddleOCR with optimized settings...")

            # Optimized OCR configuration
            ocr_instance = PaddleOCR(
                text_detection_model_name="PP-OCRv5_server_det",
                text_recognition_model_name="PP-OCRv5_server_rec",
                use_doc_orientation_classify=False,  # Disable for speed
                use_doc_unwarping=False,  # Disable for speed
                use_textline_orientation=True
            )
            
            initialization_time = time.time() - start_time
            logger.info(f"PaddleOCR initialized in {initialization_time:.2f}s")
            
            # Efficient warmup with multiple image types
            warmup_start = time.time()
            logger.info("Performing efficient model warmup...")
            
            warmup_images = _create_optimized_warmup_images()
            
            for i, warmup_img in enumerate(warmup_images):
                with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp_file:
                    try:
                        cv2.imwrite(tmp_file.name, warmup_img)
                        _ = ocr_instance.predict(tmp_file.name)
                        logger.debug(f"Warmup image {i+1}/{len(warmup_images)} processed")
                    finally:
                        try:
                            os.unlink(tmp_file.name)
                        except:
                            pass  # Ignore cleanup errors
            
            warmup_time = time.time() - warmup_start
            warmup_completed = True
            
            total_time = time.time() - start_time
            logger.info(f"OCR initialization completed in {total_time:.2f}s (warmup: {warmup_time:.2f}s)")
            
        except Exception as e:
            logger.error(f"FATAL: Failed to initialize PaddleOCR engine: {e}")
            logger.error("The application cannot function without the OCR engine.")
            ocr_instance = None
            raise e

def get_ocr_instance():
    """
    Thread-safe access to the initialized OCR instance.
    Raises RuntimeError if the instance is not initialized.
    """
    with ocr_lock:
        if ocr_instance is None:
            raise RuntimeError("OCR instance is not initialized. The application cannot proceed.")
        return ocr_instance

def is_ocr_initialized() -> bool:
    """
    Thread-safe check if the OCR instance is initialized.
    """
    with ocr_lock:
        return ocr_instance is not None

def is_warmup_completed() -> bool:
    """
    Check if OCR warmup has been completed.
    """
    return warmup_completed

def get_ocr_stats() -> dict:
    """
    Get OCR instance statistics and performance metrics.
    """
    with ocr_lock:
        return {
            'initialized': ocr_instance is not None,
            'initialization_time': initialization_time,
            'warmup_completed': warmup_completed,
            'instance_id': id(ocr_instance) if ocr_instance else None
        }