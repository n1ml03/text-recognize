"""
Memory-optimized image preprocessing pipeline for maximizing OCR accuracy and performance.
Includes deskewing, upscaling, and other enhancement techniques with minimal memory footprint.
"""
import cv2
import numpy as np
import logging
from typing import Tuple
from functools import lru_cache

from models import PreprocessingOptions
from config import MIN_IMAGE_WIDTH_FOR_OCR

logger = logging.getLogger(__name__)

# Cache for reusable objects to reduce memory allocation
@lru_cache(maxsize=8)
def _get_clahe_processor(clip_limit: float = 2.0, tile_grid_size: int = 8):
    """Cached CLAHE processor to avoid recreation."""
    return cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(tile_grid_size, tile_grid_size))

@lru_cache(maxsize=16)
def _get_morphology_kernel(size: int = 1):
    """Cached morphology kernel to avoid recreation."""
    return np.ones((size, size), np.uint8)

def deskew_image(image: np.ndarray) -> np.ndarray:
    """Memory-optimized skew detection and correction for OCR accuracy."""
    # Work with grayscale to reduce memory usage
    if len(image.shape) > 2:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image
    
    # Use more efficient approach for angle detection
    # Reduce image size for angle calculation to speed up processing
    height, width = gray.shape
    if width > 1000:  # Only downsample large images
        scale_factor = 1000 / width
        small_width = 1000
        small_height = int(height * scale_factor)
        small_gray = cv2.resize(gray, (small_width, small_height), interpolation=cv2.INTER_AREA)
    else:
        small_gray = gray
    
    # Fast skew detection using edges
    edges = cv2.Canny(small_gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLines(edges, 1, np.pi/180, threshold=100, min_theta=np.pi/180*85, max_theta=np.pi/180*95)
    
    if lines is not None and len(lines) > 0:
        angles = []
        for line in lines[:10]:  # Limit to first 10 lines for speed
            _, theta = line[0]  # rho not needed
            angle = (theta - np.pi/2) * 180 / np.pi
            angles.append(angle)
        
        # Use median angle for robustness
        angle = np.median(angles) if angles else 0
    else:
        angle = 0
        
    # Skip rotation for negligible angles
    if abs(angle) < 0.2:
        return image

    # Rotate using original image dimensions
    (h, w) = image.shape[:2]
    center = (w // 2, h // 2)
    rotation_matrix = cv2.getRotationMatrix2D(center, float(angle), 1.0)
    
    # Use optimized interpolation
    rotated_image = cv2.warpAffine(image, rotation_matrix, (w, h),
                                   flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    
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

def _analyze_image_quality(img: np.ndarray) -> dict:
    """Optimized analysis of image quality for OneOCR preprocessing."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) > 2 else img
    height, width = gray.shape

    # Calculate essential metrics efficiently
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()  # Sharpness
    contrast = float(np.std(gray.astype(np.float32)))

    # Simple noise detection using gradient magnitude
    grad_x = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
    grad_y = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
    noise_level = np.mean(np.sqrt(grad_x**2 + grad_y**2))

    return {
        'width': width,
        'height': height,
        'is_low_res': width < MIN_IMAGE_WIDTH_FOR_OCR,
        'is_low_contrast': contrast < 30,
        'is_blurry': laplacian_var < 100,
        'is_noisy': noise_level > 50  # High gradient variance indicates noise
    }

def enhanced_preprocess_image(image_path: str, options: PreprocessingOptions) -> np.ndarray:
    """
    Memory-optimized preprocessing pipeline with smart option selection.
    Minimizes memory usage while maximizing OCR accuracy.
    """
    try:
        # Read image only once
        img = cv2.imread(image_path, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError(f"Could not read image: {image_path}")

        # Quick quality analysis for smart preprocessing
        quality_metrics = _analyze_image_quality(img)
        
        # If no preprocessing needed, return original
        needs_processing = any([
            options.upscale and quality_metrics['is_low_res'],
            options.deskew,
            options.denoise and quality_metrics['is_blurry'],
            options.enhance_contrast and quality_metrics['is_low_contrast'],
            options.threshold_method != "none",
            options.apply_morphology
        ])
        
        if not needs_processing:
            logger.debug("Image quality is good, skipping preprocessing")
            return img

        # Work in-place to minimize memory usage
        current_img = img
        
        # 1. Upscale first if needed (affects all subsequent operations)
        if options.upscale and quality_metrics['is_low_res']:
            current_img, _ = upscale_if_needed(current_img)
            logger.debug(f"Upscaled low-res image from {quality_metrics['width']}px width")

        # 2. Deskew if requested (do early to improve other operations)
        if options.deskew:
            current_img = deskew_image(current_img)

        # 3. Convert to grayscale once for all grayscale operations
        gray = cv2.cvtColor(current_img, cv2.COLOR_BGR2GRAY)
        
        # 4. Apply denoising only if image appears blurry
        if options.denoise and quality_metrics['is_blurry']:
            # Use faster denoising for better performance
            gray = cv2.fastNlMeansDenoising(gray, None, h=8, templateWindowSize=7, searchWindowSize=15)
            logger.debug("Applied denoising to blurry image")

        # 5. Enhance contrast only if needed
        if options.enhance_contrast and quality_metrics['is_low_contrast']:
            clahe = _get_clahe_processor(clip_limit=2.0, tile_grid_size=8)
            gray = clahe.apply(gray)
            logger.debug("Enhanced contrast on low-contrast image")

        # 6. Apply optimized thresholding
        if options.threshold_method == "adaptive_gaussian":
            gray = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)
        elif options.threshold_method == "otsu":
            _, gray = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        # 7. Apply minimal morphology operations (OneOCR handles most noise well)
        if options.apply_morphology and quality_metrics['is_noisy']:
            kernel = _get_morphology_kernel(1)
            gray = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, kernel)

        # 8. OneOCR works well with grayscale, no need to convert back to BGR
        # Return grayscale for better memory efficiency
        result_img = gray
            
        logger.debug(f"Preprocessing completed with smart optimizations")
        return result_img
        
    except Exception as e:
        logger.error(f"Image preprocessing failed for {image_path}: {e}")
        # Fallback to original image
        try:
            return cv2.imread(image_path, cv2.IMREAD_COLOR)
        except:
            # Create a minimal error image if even fallback fails
            return np.ones((100, 400, 3), dtype=np.uint8) * 255