"""
OneOCR instance management with thread-safe initialization.
"""
import logging
import threading
import time
from typing import Optional
import oneocr

logger = logging.getLogger(__name__)

ocr_instance: Optional[oneocr.OcrEngine] = None
ocr_lock = threading.RLock()
initialization_time: Optional[float] = None

def initialize_ocr():
    """Initialize OneOCR engine with thread safety."""
    global ocr_instance, initialization_time

    with ocr_lock:
        if ocr_instance is not None:
            return

        start_time = time.time()
        try:
            logger.info("Initializing OneOCR engine...")
            ocr_instance = oneocr.OcrEngine()
            initialization_time = time.time() - start_time
            logger.info(f"OneOCR initialized successfully in {initialization_time:.2f}s")
        except Exception as e:
            logger.error(f"Failed to initialize OneOCR: {e}")
            ocr_instance = None
            raise RuntimeError(f"OneOCR initialization failed: {e}") from e

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

def get_ocr_stats() -> dict:
    """Get OCR instance statistics."""
    with ocr_lock:
        return {
            'initialized': ocr_instance is not None,
            'initialization_time': initialization_time,
            'instance_id': id(ocr_instance) if ocr_instance else None,
            'engine_type': 'OneOCR'
        }