"""
Core OCR processing logic that uses the initialized PaddleOCR instance
and the image preprocessing pipeline.
"""
import time
import hashlib
import logging
from typing import cast

from models import PreprocessingOptions, TextProcessingOptions, OCRResult, BoundingBox, WordDetail, TextLine
from .ocr_instance import get_ocr_instance
from .image_preprocessor import enhanced_preprocess_image
from utils.caching import get_cached_result, cache_result
from utils.performance import update_performance_metrics
from utils.text_postprocessor import improve_text_structure
from config import MIN_OCR_CONFIDENCE

logger = logging.getLogger(__name__)

def perform_ocr_on_image(image_path: str, options: PreprocessingOptions, text_options: TextProcessingOptions) -> OCRResult:
    """
    Performs OCR on a single image file, applying preprocessing and caching.
    """
    start_time = time.time()
    
    # Generate cache key from file content and options
    try:
        with open(image_path, 'rb') as f:
            file_hash = hashlib.blake2b(f.read(), digest_size=16).hexdigest()
    except IOError:
        return OCRResult(text="", confidence=0, processing_time=0, success=False, error_message="File not found or unreadable.")

    options_hash = hashlib.blake2b(options.model_dump_json().encode(), digest_size=8).hexdigest()
    cache_key = f"ocr_{file_hash}_{options_hash}"
    
    cached = get_cached_result(cache_key)
    if cached:
        return OCRResult(**cached)
        
    try:
        # Get the OCR instance (will raise RuntimeError if not initialized)
        ocr_instance = get_ocr_instance()
        
        # Apply the full preprocessing pipeline
        processed_image = enhanced_preprocess_image(image_path, options)
        
        # Perform OCR using the new PaddleOCR API
        paddle_results = ocr_instance.predict(processed_image)
        

        
        extracted_text = ""
        word_details = []
        text_lines = []
        total_confidence = 0.0
        word_count = 0
        line_count = 0
        
        # Initialize raw output fields
        rec_texts = []
        rec_scores = []
        rec_polys = []
        detection_polygons = []
        textline_angles = []
        
        if paddle_results and len(paddle_results) > 0:
            result_data = paddle_results[0]  # First page
            
            # Convert result to dict to access fields
            try:
                result_dict = dict(result_data)
                
                # Extract raw PaddleOCR fields from dict
                rec_texts = result_dict.get('rec_texts', [])
                raw_scores = result_dict.get('rec_scores', [])
                rec_scores = [float(score) for score in raw_scores]
                
                raw_polys = result_dict.get('rec_polys', [])
                rec_polys = [poly.tolist() if hasattr(poly, 'tolist') else poly for poly in raw_polys]
                
                raw_dt_polys = result_dict.get('dt_polys', [])
                detection_polygons = [poly.tolist() if hasattr(poly, 'tolist') else poly for poly in raw_dt_polys]
                
                # Get textline orientation angles if available
                textline_angles = result_dict.get('textline_orientation_angles', [])
                
                logger.debug(f"Extracted - rec_texts: {rec_texts}")
                logger.debug(f"Extracted - rec_scores: {rec_scores}")
                logger.debug(f"Extracted - rec_polys count: {len(rec_polys)}")
                logger.debug(f"Extracted - dt_polys count: {len(detection_polygons)}")
                
            except Exception as e:
                logger.error(f"Error extracting from result dict: {e}")
                # Fallback to empty results
                rec_texts = []
                rec_scores = []
                rec_polys = []
                detection_polygons = []
                textline_angles = []
        else:
            logger.debug(f"No paddle results or empty results: {paddle_results}")
            
        # Process recognized texts and scores
        for i, (text, confidence) in enumerate(zip(rec_texts, rec_scores)):
            confidence = float(confidence)
            
            if confidence >= MIN_OCR_CONFIDENCE and text:
                # Get polygon coordinates
                polygon_coords = []
                if i < len(rec_polys):
                    polygon = rec_polys[i]
                    polygon_coords = polygon if isinstance(polygon, list) else []
                
                # Convert polygon to BoundingBox
                if polygon_coords:
                    x_coords = [p[0] for p in polygon_coords]
                    y_coords = [p[1] for p in polygon_coords]
                    x_min, y_min = int(min(x_coords)), int(min(y_coords))
                    x_max, y_max = int(max(x_coords)), int(max(y_coords))
                    width, height = x_max - x_min, y_max - y_min
                    
                    bbox = BoundingBox(x=x_min, y=y_min, width=width, height=height)
                    
                    # Add to word details (keeping backward compatibility)
                    word_details.append(WordDetail(
                        text=text,
                        confidence=confidence,
                        bbox=bbox,
                        polygon=polygon_coords
                    ))
                    
                    # Add to text lines (new feature)
                    orientation_angle = textline_angles[i] if i < len(textline_angles) else 0
                    text_lines.append(TextLine(
                        text=text,
                        confidence=confidence,
                        bbox=bbox,
                        polygon=polygon_coords,
                        textline_orientation_angle=orientation_angle
                    ))
                    
                    total_confidence += confidence
                    word_count += 1
                    line_count += 1
        
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
        
        avg_confidence = (total_confidence / word_count) if word_count > 0 else 0.0
        processing_time = time.time() - start_time
        
        result = OCRResult(
            text=extracted_text.strip(),
            confidence=avg_confidence,
            processing_time=processing_time,
            word_details=word_details,
            text_lines=text_lines,
            word_count=word_count,
            line_count=line_count,
            file_path=image_path,
            metadata={"preprocessing_options": options.model_dump()},
            rec_texts=rec_texts,
            rec_scores=rec_scores,
            rec_polys=rec_polys,
            detection_polygons=detection_polygons
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