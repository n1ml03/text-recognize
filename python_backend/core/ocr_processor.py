"""
OneOCR-only processing with image preprocessing and result formatting.
Simplified to use OneOCR exclusively without legacy compatibility.
"""
import time
import hashlib
import logging
import cv2
from PIL import Image

from models import PreprocessingOptions, TextProcessingOptions, OCRResult, BoundingBox, WordDetail, TextLine
from .ocr_instance import get_ocr_instance
from .image_preprocessor import enhanced_preprocess_image
from utils.caching import get_cached_result, cache_result
from utils.performance import update_performance_metrics
from utils.text_postprocessor import improve_text_structure
from config import MIN_OCR_CONFIDENCE

logger = logging.getLogger(__name__)

def _convert_to_pil_image(processed_image) -> Image.Image:
    """Convert processed image to PIL Image format with memory optimization."""
    if isinstance(processed_image, str):
        # Direct file path - let PIL handle it efficiently
        return Image.open(processed_image)
    else:
        # Convert numpy array to PIL with minimal memory overhead
        if len(processed_image.shape) == 3 and processed_image.shape[2] == 3:
            # BGR to RGB conversion
            rgb_image = cv2.cvtColor(processed_image, cv2.COLOR_BGR2RGB)
        else:
            # Grayscale or already RGB
            rgb_image = processed_image
        return Image.fromarray(rgb_image)

def _extract_word_details(oneocr_results: dict) -> tuple[list[WordDetail], float, int]:
    """Extract word details from OneOCR results with optimized processing."""
    word_details = []
    total_confidence = 0.0
    word_count = 0

    # Pre-allocate lists for better performance
    lines = oneocr_results.get('lines', [])
    if not lines:
        return word_details, 0.0, 0

    for line_data in lines:
        words = line_data.get('words', [])
        for word_data in words:
            word_text = word_data.get('text', '').strip()
            word_confidence = word_data.get('confidence', 0.0)
            word_bbox = word_data.get('bounding_rect', {})

            # Skip low-confidence or empty words early
            if not word_text or word_confidence < MIN_OCR_CONFIDENCE or not word_bbox:
                continue

            # Extract coordinates efficiently
            x1, y1 = word_bbox.get('x1', 0), word_bbox.get('y1', 0)
            x2, y2 = word_bbox.get('x2', 0), word_bbox.get('y2', 0)
            x3, y3 = word_bbox.get('x3', 0), word_bbox.get('y3', 0)
            x4, y4 = word_bbox.get('x4', 0), word_bbox.get('y4', 0)

            # Calculate bounding box efficiently
            min_x, max_x = min(x1, x2, x3, x4), max(x1, x2, x3, x4)
            min_y, max_y = min(y1, y2, y3, y4), max(y1, y2, y3, y4)

            bbox = BoundingBox(
                x=int(min_x), y=int(min_y),
                width=int(max_x - min_x),
                height=int(max_y - min_y)
            )

            # Create polygon coordinates - convert floats to integers
            polygon = [[int(x1), int(y1)], [int(x2), int(y2)], [int(x3), int(y3)], [int(x4), int(y4)]]

            word_details.append(WordDetail(
                text=word_text,
                confidence=word_confidence,
                bbox=bbox,
                polygon=polygon
            ))

            total_confidence += word_confidence
            word_count += 1

    return word_details, total_confidence, word_count

def _extract_text_lines(oneocr_results: dict) -> list[TextLine]:
    """Extract text lines from OneOCR results."""
    text_lines = []
    text_angle = oneocr_results.get('text_angle', 0.0)  # OneOCR returns float angles

    for line_data in oneocr_results.get('lines', []):
        line_text = line_data.get('text', '')
        line_bbox = line_data.get('bounding_rect', {})

        if line_text and line_bbox:
            # Convert line bounding_rect to polygon - convert floats to integers
            polygon = [
                [int(line_bbox.get('x1', 0)), int(line_bbox.get('y1', 0))],
                [int(line_bbox.get('x2', 0)), int(line_bbox.get('y2', 0))],
                [int(line_bbox.get('x3', 0)), int(line_bbox.get('y3', 0))],
                [int(line_bbox.get('x4', 0)), int(line_bbox.get('y4', 0))]
            ]

            # Calculate bounding box
            x_coords = [p[0] for p in polygon]
            y_coords = [p[1] for p in polygon]
            x_min, y_min = int(min(x_coords)), int(min(y_coords))
            x_max, y_max = int(max(x_coords)), int(max(y_coords))

            bbox = BoundingBox(
                x=x_min, y=y_min,
                width=x_max - x_min,
                height=y_max - y_min
            )

            # Calculate average confidence for the line
            words = line_data.get('words', [])
            line_confidence = sum(w.get('confidence', 0.0) for w in words) / len(words) if words else 0.0

            text_lines.append(TextLine(
                text=line_text,
                confidence=line_confidence,
                bbox=bbox,
                polygon=polygon,
                textline_orientation_angle=text_angle
            ))

    return text_lines

def perform_ocr_on_image(image_path: str, options: PreprocessingOptions, text_options: TextProcessingOptions) -> OCRResult:
    """Perform OCR on image using OneOCR with preprocessing and caching."""
    start_time = time.time()

    # Generate cache key
    try:
        with open(image_path, 'rb') as f:
            file_hash = hashlib.blake2b(f.read(), digest_size=16).hexdigest()
    except IOError:
        return OCRResult(
            text="", confidence=0, processing_time=0,
            success=False, error_message="File not found or unreadable."
        )

    options_hash = hashlib.blake2b(options.model_dump_json().encode(), digest_size=8).hexdigest()
    cache_key = f"ocr_{file_hash}_{options_hash}"

    cached = get_cached_result(cache_key)
    if cached:
        return OCRResult(**cached)

    try:
        ocr_instance = get_ocr_instance()
        processed_image = enhanced_preprocess_image(image_path, options)
        pil_image = _convert_to_pil_image(processed_image)

        # Perform OCR using OneOCR
        oneocr_results = ocr_instance.recognize_pil(pil_image)

        if not oneocr_results or 'lines' not in oneocr_results:
            logger.warning("No valid OneOCR results received")
            return OCRResult(
                text="", confidence=0, processing_time=time.time() - start_time,
                file_path=image_path, success=True, error_message="No text detected"
            )

        # Extract structured data from OneOCR results
        extracted_text = oneocr_results.get('text', '')
        word_details, total_confidence, word_count = _extract_word_details(oneocr_results)
        text_lines = _extract_text_lines(oneocr_results)

        # Calculate average confidence
        avg_confidence = total_confidence / word_count if word_count > 0 else 0.0

        # Apply text post-processing based on options
        text_options = text_options or TextProcessingOptions()

        try:
            if word_details and text_options.use_advanced_processing:
                logger.debug("Applying advanced text post-processing for improved structure")
                extracted_text = improve_text_structure(
                    word_details,
                    text_lines,
                    reading_order=text_options.reading_order
                )
                logger.debug(f"Post-processed text preview: {extracted_text[:100]}...")
            else:
                # Fallback to simple concatenation
                extracted_text = " ".join([word.text for word in word_details])
        except Exception as e:
            logger.error(f"Text post-processing failed, falling back to simple concatenation: {e}")
            # Fallback to simple concatenation if post-processing fails
            extracted_text = " ".join([word.text for word in word_details])

        processing_time = time.time() - start_time
        line_count = len(text_lines)

        result = OCRResult(
            text=extracted_text.strip(),
            confidence=avg_confidence,
            processing_time=processing_time,
            word_details=word_details,
            text_lines=text_lines,
            word_count=word_count,
            line_count=line_count,
            file_path=image_path,
            metadata={"preprocessing_options": options.model_dump()}
        )
        
        cache_result(cache_key, result.model_dump())
        update_performance_metrics("images_processed")
        
        return result

    except Exception as e:
        logger.error(f"OCR processing failed for {image_path}: {e}", exc_info=True)
        update_performance_metrics("error_count")
        return OCRResult(
            text="",
            confidence=0.0,
            processing_time=time.time() - start_time,
            file_path=image_path,
            success=False,
            error_message=str(e)
        )