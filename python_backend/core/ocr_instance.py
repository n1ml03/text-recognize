"""
Initializes and manages the global PaddleOCR instance.
"""
import logging
import sys
from typing import Optional, Any
from paddleocr import PaddleOCR

logger = logging.getLogger(__name__)

# Global variable to hold the OCR instance
ocr_instance: Optional[Any] = None

def initialize_ocr():
    """
    Initializes the PaddleOCR instance with server models for high accuracy.
    This function is called once at application startup.
    """
    global ocr_instance
    if ocr_instance is not None:
        logger.info("OCR instance already initialized.")
        return

    try:
        logger.info("Initializing PaddleOCR...")
        logger.info("This may take a moment to download models for the first time.")

        # Using server models for higher accuracy by default.
        # Set `use_gpu=True` if a compatible GPU and CUDA environment are available.
        ocr_instance = PaddleOCR(
            text_detection_model_name="PP-OCRv5_mobile_det",
            text_recognition_model_name="PP-OCRv5_mobile_rec",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=True,
        )
        
        # Perform a dummy run to warm up the model
        # This can reduce latency on the first real request
        logger.info("Warming up OCR model...")
        import numpy as np
        import cv2
        import tempfile
        
        # Create a simple test image
        dummy_image = np.ones((100, 400, 3), dtype=np.uint8) * 255
        cv2.putText(dummy_image, "Test", (150, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
        
        # Use temporary file for warmup
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp_file:
            cv2.imwrite(tmp_file.name, dummy_image)
            ocr_instance.predict(tmp_file.name)  # Use predict() instead of ocr()
            import os
            os.unlink(tmp_file.name)

        logger.info("PaddleOCR initialized and warmed up successfully.")
    except Exception as e:
        logger.error(f"FATAL: Failed to initialize PaddleOCR engine: {e}")
        logger.error("The application cannot function without the OCR engine. Please check your PaddleOCR installation and model paths.")
        # Don't exit here - let the service start and provide proper error messages
        raise e

def get_ocr_instance():
    """
    Returns the initialized OCR instance.
    Raises RuntimeError if the instance is not initialized.
    """
    if ocr_instance is None:
        raise RuntimeError("OCR instance is not initialized. The application cannot proceed.")
    return ocr_instance

def is_ocr_initialized() -> bool:
    """
    Returns True if the OCR instance is initialized, False otherwise.
    """
    return ocr_instance is not None