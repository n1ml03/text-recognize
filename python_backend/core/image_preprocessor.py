"""
Advanced image preprocessing pipeline for optimizing OCR accuracy.
Includes deskewing, upscaling, and other enhancement techniques.
"""
import cv2
import numpy as np
import logging
from typing import Tuple

from models import PreprocessingOptions
from config import MIN_IMAGE_WIDTH_FOR_OCR

logger = logging.getLogger(__name__)

def deskew_image(image: np.ndarray) -> np.ndarray:
    """Detects and corrects skew in an image, crucial for OCR accuracy."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) > 2 else image
    
    # Invert and find coordinates of text
    gray_inverted = cv2.bitwise_not(gray)
    coords = np.column_stack(np.where(gray_inverted > 0))
    
    # Get the minimum area bounding box
    angle = cv2.minAreaRect(coords)[-1]
    
    # Adjust angle from cv2.minAreaRect
    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle
        
    # Skip rotation for negligible angles to preserve quality
    if abs(angle) < 0.1:
        return image

    (h, w) = image.shape[:2]
    center = (w // 2, h // 2)
    rotation_matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    
    # Use high-quality interpolation and replicate border pixels
    rotated_image = cv2.warpAffine(image, rotation_matrix, (w, h),
                                   flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    
    logger.debug(f"Deskewed image with angle: {angle:.2f} degrees")
    return rotated_image

def upscale_if_needed(image: np.ndarray) -> Tuple[np.ndarray, bool]:
    """Upscales low-resolution images to a minimum width suitable for OCR."""
    height, width = image.shape[:2]
    if width < MIN_IMAGE_WIDTH_FOR_OCR:
        scale_factor = MIN_IMAGE_WIDTH_FOR_OCR / width
        new_height = int(height * scale_factor)
        # Use Lanczos interpolation for high-quality upscaling
        upscaled_image = cv2.resize(image, (MIN_IMAGE_WIDTH_FOR_OCR, new_height), interpolation=cv2.INTER_LANCZOS4)
        logger.debug(f"Upscaled image from {width}x{height} to {MIN_IMAGE_WIDTH_FOR_OCR}x{new_height}")
        return upscaled_image, True
    return image, False

def enhanced_preprocess_image(image_path: str, options: PreprocessingOptions) -> np.ndarray:
    """
    Applies a series of advanced preprocessing steps to an image to maximize OCR accuracy.
    """
    try:
        img = cv2.imread(image_path, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError(f"Could not read image: {image_path}")

        # If no preprocessing options are enabled, return original image
        if not any([options.upscale, options.deskew, options.denoise, options.enhance_contrast, 
                   options.threshold_method != "none", options.apply_morphology]):
            return img

        processed_img = img.copy()

        # 1. Upscale if the image is too small
        if options.upscale:
            processed_img, _ = upscale_if_needed(processed_img)

        # 2. Deskew the image to align text horizontally
        if options.deskew:
            processed_img = deskew_image(processed_img)

        # 3. Convert to grayscale for further processing
        gray = cv2.cvtColor(processed_img, cv2.COLOR_BGR2GRAY)

        # 4. Apply denoising if requested
        if options.denoise:
            gray = cv2.fastNlMeansDenoising(gray, None, h=10, templateWindowSize=7, searchWindowSize=21)

        # 5. Enhance contrast using CLAHE if requested
        if options.enhance_contrast:
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            gray = clahe.apply(gray)

        # 6. Apply thresholding to create a binary image
        if options.threshold_method == "adaptive_gaussian":
            gray = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)
        elif options.threshold_method == "otsu":
            _, gray = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        # For "none" or any other value, keep as grayscale

        # 7. Apply morphological operations if requested
        if options.apply_morphology:
            kernel = np.ones((1, 1), np.uint8)
            gray = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, kernel)
            gray = cv2.morphologyEx(gray, cv2.MORPH_OPEN, kernel)
        
        # 8. Convert back to 3-channel image for PaddleOCR compatibility
        if len(gray.shape) == 2:
            result_img = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
        else:
            result_img = gray
            
        return result_img
    except Exception as e:
        logger.error(f"Image preprocessing failed for {image_path}: {e}")
        # Fallback to returning the original image if preprocessing fails
        return cv2.imread(image_path, cv2.IMREAD_COLOR)