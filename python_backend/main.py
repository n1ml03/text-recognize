#!/usr/bin/env python3
"""
PaddleOCR Backend Service for Tauri Application
Provides OCR functionality with video processing and text deduplication
"""

import atexit
import gc
import hashlib
import logging
import os
import signal
import sys
import tempfile
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
from concurrent.futures import ThreadPoolExecutor

# Core dependencies
import shutil
import cv2
import numpy as np
import psutil
import uvicorn
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

# Lazy imports for better startup performance
_levenshtein = None
_pypdfium2 = None
_docx2txt = None
_striprtf = None

def get_levenshtein():
    """Lazy import Levenshtein for text similarity calculations"""
    global _levenshtein
    if _levenshtein is None:
        import Levenshtein
        _levenshtein = Levenshtein
    return _levenshtein

def get_pypdfium2():
    """Lazy import pypdfium2 for PDF processing"""
    global _pypdfium2
    if _pypdfium2 is None:
        import pypdfium2
        _pypdfium2 = pypdfium2
    return _pypdfium2

def get_docx2txt():
    """Lazy import docx2txt for DOCX processing"""
    global _docx2txt
    if _docx2txt is None:
        import docx2txt
        _docx2txt = docx2txt
    return _docx2txt

def get_striprtf():
    """Lazy import striprtf for RTF processing"""
    global _striprtf
    if _striprtf is None:
        from striprtf.striprtf import rtf_to_text
        _striprtf = rtf_to_text
    return _striprtf

# Import our modular components
try:
    from .models import (
        PreprocessingOptions, VideoProcessingOptions, OCRResult,
        DocumentExtractionResult, DocumentExtractionRequest,
        BoundingBox, WordDetail, BatchOCRRequest, BatchOCRResult
    )
    from .routes import video_router
except ImportError:
    # Handle case when running main.py directly
    from models import (
        PreprocessingOptions, VideoProcessingOptions, OCRResult,
        DocumentExtractionResult, DocumentExtractionRequest,
        BoundingBox, WordDetail, BatchOCRRequest, BatchOCRResult
    )
    from routes import video_router

# Handle PyInstaller executable environment
def get_resource_path(relative_path):
    """Get absolute path to resource, works for dev and for PyInstaller"""

    base_path = os.path.abspath(".")

    return os.path.join(base_path, relative_path)

def get_executable_dir():
    """Get the directory where the executable is located"""
    if getattr(sys, 'frozen', False):
        # Running as compiled executable
        return os.path.dirname(sys.executable)
    else:
        # Running as script
        return os.path.dirname(os.path.abspath(__file__))

# Configure logging for executable environment
def setup_logging():
    """Setup logging that works in both development and executable environments"""
    # Get log file path relative to executable
    log_dir = get_executable_dir()
    log_file = os.path.join(log_dir, 'paddleocr_service.log')

    # Ensure log directory exists
    os.makedirs(log_dir, exist_ok=True)

    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(log_file),
            logging.StreamHandler(sys.stdout)
        ]
    )

    return logging.getLogger(__name__)

# Setup logging
logger = setup_logging()

# Import PaddleOCR with error handling
try:
    from paddleocr import PaddleOCR
    logger.info("PaddleOCR imported successfully")
except ImportError as e:
    logger.error(f"Failed to import PaddleOCR: {e}")
    sys.exit(1)

# App will be defined later with lifespan

# Global OCR instance
ocr_instance: Optional[Any] = None

# Performance optimization globals with better typing
ocr_cache: Dict[str, Dict[str, Any]] = {}  # Cache for OCR results
cache_lock = threading.RLock()  # Use RLock for better performance
thread_pool: Optional[ThreadPoolExecutor] = None
CACHE_MAX_SIZE = 100  # Maximum number of cached results
CACHE_TTL = 3600  # Cache time-to-live in seconds

# Performance metrics with better structure
class PerformanceMetrics:
    """Thread-safe performance metrics container"""

    def __init__(self):
        self._lock = threading.RLock()
        self._data = {
            "total_requests": 0,
            "cache_hits": 0,
            "cache_misses": 0,
            "total_processing_time": 0.0,
            "average_processing_time": 0.0,
            "memory_usage_samples": [],
            "error_count": 0,
            "frames_processed": 0,
            "videos_processed": 0,
            "images_processed": 0,
            "startup_time": time.time(),
            "http2_requests": 0,
            "compressed_responses": 0,
            "compression_ratio_sum": 0.0,
            "batch_requests": 0,
            "batch_files_processed": 0,
            "connection_reuse_count": 0,
            "request_response_times": []
        }

    def increment(self, key: str, value: Union[int, float] = 1) -> None:
        """Thread-safe increment of a metric"""
        with self._lock:
            if key in self._data:
                self._data[key] += value

    def set_value(self, key: str, value: Any) -> None:
        """Thread-safe setting of a metric value"""
        with self._lock:
            self._data[key] = value

    def append_value(self, key: str, value: Any, max_size: int = 1000) -> None:
        """Thread-safe append to a list metric with size limit"""
        with self._lock:
            if key not in self._data:
                self._data[key] = []
            self._data[key].append(value)
            if len(self._data[key]) > max_size:
                self._data[key] = self._data[key][-max_size:]

    def get_copy(self) -> Dict[str, Any]:
        """Get a thread-safe copy of all metrics"""
        with self._lock:
            return self._data.copy()

performance_metrics = PerformanceMetrics()

def get_file_hash(file_path: str) -> str:
    """Generate hash for file caching"""
    try:
        # Use file path, size, and modification time for hash
        stat = os.stat(file_path)
        hash_input = f"{file_path}_{stat.st_size}_{stat.st_mtime}"
        return hashlib.md5(hash_input.encode()).hexdigest()
    except Exception:
        return hashlib.md5(file_path.encode()).hexdigest()

def update_performance_metrics(metric_name: str, value: Any = None):
    """Update performance metrics thread-safely using the new PerformanceMetrics class"""
    if metric_name == "cache_hit":
        performance_metrics.increment("cache_hits")
    elif metric_name == "cache_miss":
        performance_metrics.increment("cache_misses")
    elif metric_name == "request":
        performance_metrics.increment("total_requests")
    elif metric_name == "processing_time" and value is not None:
        performance_metrics.increment("total_processing_time", value)
        performance_metrics.append_value("request_response_times", value, 1000)
        # Update average processing time
        metrics_data = performance_metrics.get_copy()
        if metrics_data["total_requests"] > 0:
            avg_time = metrics_data["total_processing_time"] / metrics_data["total_requests"]
            performance_metrics.set_value("average_processing_time", avg_time)
    elif metric_name == "batch_request":
        performance_metrics.increment("batch_requests")
    elif metric_name == "batch_files_processed" and value is not None:
        performance_metrics.increment("batch_files_processed", value)
    elif metric_name == "http2_request":
        performance_metrics.increment("http2_requests")
    elif metric_name == "compressed_response":
        performance_metrics.increment("compressed_responses")
    elif metric_name == "compression_ratio" and value is not None:
        performance_metrics.increment("compression_ratio_sum", value)
    elif metric_name == "connection_reuse":
        performance_metrics.increment("connection_reuse_count")
    elif metric_name == "error":
        performance_metrics.increment("error_count")
    elif metric_name == "video_processed":
        performance_metrics.increment("videos_processed")
    elif metric_name == "frame_processed":
        performance_metrics.increment("frames_processed")
    elif metric_name == "image_processed":
        performance_metrics.increment("images_processed")
    elif metric_name == "memory_usage" and value is not None:
        performance_metrics.append_value("memory_usage_samples", value, 100)

def get_cached_result(cache_key: str) -> Optional[Dict]:
    """Get cached OCR result if available and not expired"""
    with cache_lock:
        if cache_key in ocr_cache:
            cached_item = ocr_cache[cache_key]
            if time.time() - cached_item['timestamp'] < CACHE_TTL:
                logger.debug(f"Cache hit for key: {cache_key}")
                update_performance_metrics("cache_hit")
                return cached_item['result']
            else:
                # Remove expired cache entry
                del ocr_cache[cache_key]
                logger.debug(f"Cache expired for key: {cache_key}")

    update_performance_metrics("cache_miss")
    return None

def cache_result(cache_key: str, result: Dict):
    """Cache OCR result with timestamp"""
    with cache_lock:
        # Remove oldest entries if cache is full
        if len(ocr_cache) >= CACHE_MAX_SIZE:
            oldest_key = min(ocr_cache.keys(), key=lambda k: ocr_cache[k]['timestamp'])
            del ocr_cache[oldest_key]
            logger.debug(f"Removed oldest cache entry: {oldest_key}")

        ocr_cache[cache_key] = {
            'result': result,
            'timestamp': time.time()
        }
        logger.debug(f"Cached result for key: {cache_key}")

def clear_expired_cache():
    """Clear expired cache entries"""
    current_time = time.time()
    with cache_lock:
        expired_keys = [
            key for key, value in ocr_cache.items()
            if current_time - value['timestamp'] > CACHE_TTL
        ]
        for key in expired_keys:
            del ocr_cache[key]
        if expired_keys:
            logger.info(f"Cleared {len(expired_keys)} expired cache entries")

# Configuration constants
SUPPORTED_IMAGE_FORMATS = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp']
SUPPORTED_VIDEO_FORMATS = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv']
SUPPORTED_DOCUMENT_FORMATS = ['.pdf', '.docx', '.txt', '.rtf']
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
SIMILARITY_THRESHOLD = 0.85  # Text similarity threshold for deduplication
MIN_CONFIDENCE = 0.5  # Minimum OCR confidence threshold

# BoundingBox, WordDetail, and OCRResult moved to models.py

# Models moved to models.py module

def cleanup_memory(force_full_gc: bool = False) -> None:
    """Enhanced memory cleanup with intelligent garbage collection and monitoring"""
    try:
        # Clear expired cache entries first
        clear_expired_cache()

        # Get initial memory usage
        process = psutil.Process()
        initial_memory = process.memory_info().rss / 1024 / 1024

        # Force garbage collection with different strategies
        if force_full_gc:
            # Full garbage collection cycle with all generations
            collected_objects = 0
            for generation in range(3):
                collected_objects += gc.collect(generation)
            logger.debug(f"Full GC collected {collected_objects} objects")
        else:
            # Quick garbage collection
            collected_objects = gc.collect()
            logger.debug(f"Quick GC collected {collected_objects} objects")

        # Log memory usage improvement
        final_memory = process.memory_info().rss / 1024 / 1024
        memory_saved = initial_memory - final_memory
        logger.debug(f"Memory cleanup: {initial_memory:.1f} MB -> {final_memory:.1f} MB (saved {memory_saved:.1f} MB)")

        # If memory is still high, try more aggressive cleanup
        if final_memory > 500:  # More than 500MB
            logger.warning(f"High memory usage detected: {final_memory:.1f} MB")

            # Clear more cache if needed
            cache_size = len(ocr_cache)
            if cache_size > CACHE_MAX_SIZE // 2:
                with cache_lock:
                    # Keep only the most recent half of cache entries
                    sorted_cache = sorted(
                        ocr_cache.items(),
                        key=lambda x: x[1]['timestamp'],
                        reverse=True
                    )
                    ocr_cache.clear()
                    for key, value in sorted_cache[:CACHE_MAX_SIZE // 2]:
                        ocr_cache[key] = value
                logger.info(f"Reduced cache size from {cache_size} to {len(ocr_cache)} entries")

            # Force full GC after cache cleanup
            for generation in range(3):
                gc.collect(generation)

        # Update memory usage metrics
        update_performance_metrics("memory_usage", final_memory)

    except Exception as e:
        logger.warning(f"Memory cleanup warning: {e}")

def check_memory_usage():
    """Enhanced memory usage monitoring with adaptive thresholds"""
    try:
        process = psutil.Process()
        memory_info = process.memory_info()
        memory_mb = memory_info.rss / 1024 / 1024
        memory_percent = process.memory_percent()

        # Adaptive memory management based on system resources
        system_memory = psutil.virtual_memory()
        available_mb = system_memory.available / 1024 / 1024

        # Dynamic threshold based on available system memory
        if available_mb < 1000:  # Less than 1GB available
            threshold = 70
        elif available_mb < 2000:  # Less than 2GB available
            threshold = 75
        else:
            threshold = 80

        if memory_percent > threshold:
            logger.warning(f"High memory usage: {memory_percent:.1f}% ({memory_mb:.1f} MB)")
            cleanup_memory(force_full_gc=True)
            return False
        elif memory_mb > 300:  # More than 300MB
            logger.debug(f"Moderate memory usage: {memory_mb:.1f} MB")
            cleanup_memory()

        return True
    except Exception as e:
        logger.warning(f"Memory check warning: {e}")
        return True

async def initialize_ocr():
    """Initialize PaddleOCR instance"""
    global ocr_instance
    try:
        logger.info("Initializing PaddleOCR...")
        ocr_instance = PaddleOCR(
            text_detection_model_name="PP-OCRv5_mobile_det",
            text_recognition_model_name="PP-OCRv5_mobile_rec",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )
        logger.info("PaddleOCR initialized successfully")
        cleanup_memory()  # Clean up after initialization
    except Exception as e:
        logger.error(f"Failed to initialize PaddleOCR: {e}")
        raise

from contextlib import asynccontextmanager


class PerformanceTrackingMiddleware(BaseHTTPMiddleware):
    """Middleware to track HTTP/2 usage, compression, and response times"""

    async def dispatch(self, request: Request, call_next):
        start_time = time.time()

        # Track HTTP version
        http_version = request.scope.get("http_version", "1.1")
        if http_version == "2.0" or http_version == "2":
            update_performance_metrics("http2_request")

        # Process request
        response = await call_next(request)

        # Calculate response time
        response_time = time.time() - start_time
        update_performance_metrics("processing_time", response_time)

        # Track compression if response is compressed
        content_encoding = response.headers.get("content-encoding")
        if content_encoding and content_encoding in ["gzip", "br", "deflate"]:
            update_performance_metrics("compressed_response")

            # Estimate compression ratio if possible
            content_length = response.headers.get("content-length")
            if content_length:
                # This is a rough estimate - in practice, we'd need the original size
                estimated_ratio = 0.3  # Assume 30% compression ratio for text content
                update_performance_metrics("compression_ratio", estimated_ratio)

        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    global thread_pool
    # Startup
    logger.info("Starting up PaddleOCR service...")

    # Initialize thread pool for parallel processing
    thread_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="ocr_worker")
    logger.info("Thread pool initialized")

    await initialize_ocr()
    yield

    # Shutdown
    logger.info("Shutting down PaddleOCR service...")

    # Shutdown thread pool
    if thread_pool:
        thread_pool.shutdown(wait=True)
        logger.info("Thread pool shutdown complete")

    # Clear cache
    with cache_lock:
        ocr_cache.clear()
        logger.info("Cache cleared")

    cleanup_memory()

# Update app initialization to use lifespan
app = FastAPI(
    title="PaddleOCR Service",
    version="1.0.0",
    lifespan=lifespan
)

# Add performance tracking middleware (should be first)
app.add_middleware(PerformanceTrackingMiddleware)

# Add compression middleware (should be added before CORS)
app.add_middleware(
    GZipMiddleware,
    minimum_size=1024,  # Only compress responses larger than 1KB
    compresslevel=6     # Balance between compression ratio and speed
)

# Add CORS middleware for maximum network accessibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins (any IP address)
    allow_credentials=True,
    allow_methods=["*"],  # Allow all HTTP methods
    allow_headers=["*"],  # Allow all headers
    expose_headers=["*"],  # Expose all headers to clients
    allow_origin_regex=r".*",  # Allow any origin pattern
    max_age=3600,  # Cache preflight requests for 1 hour
)

# Include video processing routes
app.include_router(video_router)

def preprocess_image(image_path: str, options: PreprocessingOptions) -> str:
    """
    Optimized image preprocessing with memory-efficient operations and smart caching
    Returns path to preprocessed image
    """
    try:
        # Generate cache key for preprocessing
        file_hash = get_file_hash(image_path)
        options_hash = hashlib.md5(str(options.model_dump()).encode()).hexdigest()
        cache_key = f"preprocess_{file_hash}_{options_hash}"

        # Check if preprocessed version exists in cache
        cached_result = get_cached_result(cache_key)
        if cached_result and os.path.exists(cached_result.get('path', '')):
            logger.debug(f"Using cached preprocessed image: {cached_result['path']}")
            return cached_result['path']

        # Read image with memory optimization
        img = cv2.imread(image_path, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError(f"Could not read image: {image_path}")

        # Get image dimensions for optimization decisions
        height, width = img.shape[:2]
        total_pixels = height * width

        # Early return if no preprocessing needed
        if not any([options.enhance_contrast, options.denoise, options.apply_morphology,
                   options.threshold_method != "none"]):
            return image_path

        # Resize large images to improve processing speed
        if total_pixels > 2000000:  # More than 2MP
            scale_factor = np.sqrt(2000000 / total_pixels)
            new_width = int(width * scale_factor)
            new_height = int(height * scale_factor)
            img = cv2.resize(img, (new_width, new_height), interpolation=cv2.INTER_AREA)
            logger.debug(f"Resized image from {width}x{height} to {new_width}x{new_height}")

        # Convert to grayscale efficiently
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img.copy()
        del img  # Clear original image from memory immediately

        # Apply preprocessing operations in optimal order
        if options.denoise:
            # Use faster denoising for large images
            if total_pixels > 1000000:
                gray = cv2.medianBlur(gray, 3)  # Faster alternative
            else:
                gray = cv2.fastNlMeansDenoising(gray, h=10, templateWindowSize=7, searchWindowSize=21)

        if options.enhance_contrast:
            # Use CLAHE for better contrast enhancement
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            gray = clahe.apply(gray)

        # Apply thresholding
        if options.threshold_method == "adaptive_gaussian":
            gray = cv2.adaptiveThreshold(
                gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
            )
        elif options.threshold_method == "otsu":
            # Use Gaussian blur before Otsu for better results
            gray = cv2.GaussianBlur(gray, (5, 5), 0)
            _, gray = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        if options.apply_morphology:
            # Use optimized kernel operations
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
            gray = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, kernel, iterations=1)

        # Save preprocessed image with optimized compression
        temp_path = tempfile.mktemp(suffix='.png')
        cv2.imwrite(temp_path, gray, [cv2.IMWRITE_PNG_COMPRESSION, 1])  # Fast compression
        del gray  # Clear processed image from memory

        # Cache the preprocessed image path
        cache_result(cache_key, {'path': temp_path})

        return temp_path

    except Exception as e:
        logger.error(f"Image preprocessing failed: {e}")
        return image_path  # Return original if preprocessing fails

def extract_video_frames(video_path: str, options: VideoProcessingOptions) -> List[str]:
    """
    Optimized video frame extraction with intelligent sampling and memory management
    Returns list of frame file paths
    """
    try:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Could not open video: {video_path}")

        frames_dir = tempfile.mkdtemp(prefix="video_frames_")
        frame_paths = []
        frame_count = 0
        extracted_count = 0

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS)

        logger.info(f"Processing video: {total_frames} frames at {fps} FPS")

        # Optimize frame interval based on video length
        if total_frames > 10000:  # Very long video
            effective_interval = max(options.frame_interval, total_frames // 500)
            logger.info(f"Adjusted frame interval to {effective_interval} for long video")
        else:
            effective_interval = options.frame_interval

        # Process frames in batches for better memory management
        batch_size = 10

        while cap.isOpened() and extracted_count < options.max_frames:
            ret, frame = cap.read()
            if not ret:
                break

            # Extract frame at specified interval
            if frame_count % effective_interval == 0:
                # Resize frame if too large to save memory
                height, width = frame.shape[:2]
                if width > 1920 or height > 1080:
                    scale_factor = min(1920/width, 1080/height)
                    new_width = int(width * scale_factor)
                    new_height = int(height * scale_factor)
                    frame = cv2.resize(frame, (new_width, new_height), interpolation=cv2.INTER_AREA)

                frame_path = os.path.join(frames_dir, f"frame_{extracted_count:06d}.jpg")
                # Use optimized JPEG compression
                cv2.imwrite(frame_path, frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                frame_paths.append(frame_path)
                extracted_count += 1

                # Batch processing for memory efficiency
                if extracted_count % batch_size == 0:
                    # Force garbage collection every batch
                    gc.collect()

            frame_count += 1

            # Memory check during processing
            if frame_count % 100 == 0:
                if not check_memory_usage():
                    logger.warning("High memory usage during frame extraction, reducing quality")
                    break

        cap.release()
        logger.info(f"Extracted {extracted_count} frames from video")
        return frame_paths

    except Exception as e:
        logger.error(f"Video frame extraction failed: {e}")
        raise

def process_frame_batch(frame_paths: List[str], preprocessing_options: PreprocessingOptions) -> List[Dict]:
    """
    Process a batch of frames in parallel for better performance
    """
    results = []

    def process_single_frame(frame_path: str) -> Optional[Dict]:
        try:
            # Use asyncio.run to handle the async function
            import asyncio
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                result = loop.run_until_complete(perform_ocr_on_image(frame_path, preprocessing_options))
                return {
                    "frame_path": frame_path,
                    "text": result.text.strip(),
                    "confidence": result.confidence,
                    "word_count": len(result.word_details)
                }
            finally:
                loop.close()
        except Exception as e:
            logger.warning(f"Failed to process frame {frame_path}: {e}")
            return None

    # Process frames in parallel using thread pool
    if thread_pool:
        futures = [thread_pool.submit(process_single_frame, frame_path) for frame_path in frame_paths]
        for future in futures:
            try:
                result = future.result(timeout=30)  # 30 second timeout per frame
                if result:
                    results.append(result)
            except Exception as e:
                logger.warning(f"Frame processing timeout or error: {e}")
    else:
        # Fallback to sequential processing
        for frame_path in frame_paths:
            result = process_single_frame(frame_path)
            if result:
                results.append(result)

    return results

def calculate_text_similarity(text1: str, text2: str) -> float:
    """
    Optimized text similarity calculation with multiple algorithms, caching, and early termination
    """
    if not text1 or not text2:
        return 0.0

    # Normalize texts
    text1_norm = text1.strip().lower()
    text2_norm = text2.strip().lower()

    # Exact match check
    if text1_norm == text2_norm:
        return 1.0

    # Quick length-based filtering for very different texts
    len1, len2 = len(text1_norm), len(text2_norm)
    if len1 == 0 or len2 == 0:
        return 0.0

    # If length difference is too large, texts are likely different
    length_ratio = min(len1, len2) / max(len1, len2)
    if length_ratio < 0.3:  # More than 70% length difference
        return 0.0

    # Generate cache key for similarity calculation
    cache_key = f"sim_{hashlib.md5((text1_norm + text2_norm).encode()).hexdigest()[:16]}"
    cached_similarity = get_cached_result(cache_key)
    if cached_similarity is not None:
        return cached_similarity.get('similarity', 0.0)

    # Use Jaccard similarity for quick filtering
    words1 = set(text1_norm.split())
    words2 = set(text2_norm.split())

    if not words1 or not words2:
        # Fall back to character-based comparison for very short texts
        chars1, chars2 = set(text1_norm), set(text2_norm)
        intersection = len(chars1 & chars2)
        union = len(chars1 | chars2)
        jaccard_sim = intersection / union if union > 0 else 0.0
    else:
        intersection = len(words1 & words2)
        union = len(words1 | words2)
        jaccard_sim = intersection / union if union > 0 else 0.0

    # If Jaccard similarity is very low, don't bother with expensive Levenshtein
    if jaccard_sim < 0.1:
        similarity = jaccard_sim
    else:
        # Use Levenshtein distance for final similarity calculation
        # Optimize for shorter strings by limiting comparison length
        max_compare_len = 200  # Limit comparison to first 200 characters
        text1_compare = text1_norm[:max_compare_len]
        text2_compare = text2_norm[:max_compare_len]

        try:
            levenshtein = get_levenshtein()
            distance = levenshtein.distance(text1_compare, text2_compare)
            max_len = max(len(text1_compare), len(text2_compare))
            levenshtein_sim = 1.0 - (distance / max_len) if max_len > 0 else 0.0

            # Combine Jaccard and Levenshtein similarities with weights
            similarity = 0.3 * jaccard_sim + 0.7 * levenshtein_sim
        except Exception as e:
            logger.warning(f"Levenshtein calculation failed: {e}, falling back to Jaccard")
            similarity = jaccard_sim

    # Cache the result for future use
    cache_result(cache_key, {'similarity': similarity})

    return similarity

def deduplicate_texts(texts: List[str], threshold: float = SIMILARITY_THRESHOLD) -> List[str]:
    """
    Optimized text deduplication with early termination and clustering
    """
    if not texts:
        return []

    if len(texts) == 1:
        return texts

    # Sort texts by length for better clustering
    texts_with_indices = [(text, i) for i, text in enumerate(texts)]
    texts_with_indices.sort(key=lambda x: len(x[0]), reverse=True)

    unique_texts = []
    processed_indices = set()

    for text, original_index in texts_with_indices:
        if original_index in processed_indices:
            continue

        # Quick filtering: skip very short texts
        if len(text.strip()) < 3:
            continue

        is_duplicate = False

        # Use early termination for similarity checking
        for unique_text in unique_texts:
            # Quick length check first
            len_ratio = min(len(text), len(unique_text)) / max(len(text), len(unique_text))
            if len_ratio < 0.5:  # Very different lengths
                continue

            similarity = calculate_text_similarity(text, unique_text)
            if similarity >= threshold:
                is_duplicate = True
                break

        if not is_duplicate:
            unique_texts.append(text)
            processed_indices.add(original_index)

    return unique_texts

async def perform_ocr_on_image(image_path: str, options: PreprocessingOptions) -> OCRResult:
    """
    Perform OCR on a single image using PaddleOCR with intelligent caching and optimizations
    """
    start_time = datetime.now()

    try:
        # Generate cache key based on file and options
        file_hash = get_file_hash(image_path)
        options_hash = hashlib.md5(str(options.model_dump()).encode()).hexdigest()
        cache_key = f"ocr_{file_hash}_{options_hash}"

        # Check cache first
        cached_result = get_cached_result(cache_key)
        if cached_result:
            logger.debug(f"Returning cached OCR result for {image_path}")
            return OCRResult(**cached_result)

        # Check memory before processing
        if not check_memory_usage():
            logger.warning("High memory usage detected before OCR processing")
            # Force cleanup before proceeding
            cleanup_memory(force_full_gc=True)

        # Preprocess image if needed
        processed_image_path = image_path
        preprocessing_needed = any([
            options.enhance_contrast,
            options.denoise,
            options.apply_morphology,
            options.threshold_method != "none"
        ])

        if preprocessing_needed:
            processed_image_path = preprocess_image(image_path, options)

        # Perform OCR
        if ocr_instance is None:
            raise RuntimeError("OCR instance not initialized")

        # Use the correct PaddleOCR predict method with error handling
        try:
            result = ocr_instance.predict(processed_image_path)
        except Exception as ocr_error:
            logger.error(f"PaddleOCR prediction failed: {ocr_error}")
            # Clean up and re-raise
            if processed_image_path != image_path:
                try:
                    os.unlink(processed_image_path)
                except:
                    pass
            raise ocr_error

        # Clean up preprocessed image immediately after OCR
        if processed_image_path != image_path:
            try:
                os.unlink(processed_image_path)
            except Exception as cleanup_error:
                logger.warning(f"Failed to cleanup preprocessed image: {cleanup_error}")

        # Process results based on PaddleOCR v3.x format
        extracted_text = ""
        word_details = []
        total_confidence = 0.0
        word_count = 0

        if result and len(result) > 0:
            # PaddleOCR v3.x returns Result objects with json attribute
            first_result = result[0]

            if hasattr(first_result, 'json'):
                # Use the json attribute to get structured data
                json_data = first_result.json

                # PaddleOCR v3.x stores data in 'res' key
                if 'res' in json_data:
                    res_data = json_data['res']

                    # Extract text from rec_texts field
                    if 'rec_texts' in res_data:
                        rec_texts = res_data['rec_texts']
                        rec_scores = res_data.get('rec_scores', [])
                        rec_polys = res_data.get('rec_polys', [])

                        for i, text in enumerate(rec_texts):
                            confidence = rec_scores[i] if i < len(rec_scores) else 1.0

                            if confidence >= MIN_CONFIDENCE:
                                extracted_text += text + " "

                                # Calculate bounding box from polygon if available
                                bbox_coords = None
                                if i < len(rec_polys):
                                    bbox_coords = rec_polys[i]

                                # Split text into individual words for word counting
                                words = text.strip().split()

                                if bbox_coords and len(bbox_coords) >= 4:
                                    # bbox_coords is [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
                                    x_coords = [point[0] for point in bbox_coords]
                                    y_coords = [point[1] for point in bbox_coords]
                                    x_min, x_max = min(x_coords), max(x_coords)
                                    y_min, y_max = min(y_coords), max(y_coords)

                                    # For each word in this text region, create a word detail
                                    # Since we don't have individual word bounding boxes, we'll use the region bbox
                                    for word in words:
                                        if word:  # Skip empty strings
                                            word_details.append(WordDetail(
                                                text=word,
                                                confidence=confidence,
                                                bbox=BoundingBox(
                                                    x=int(x_min),
                                                    y=int(y_min),
                                                    width=int(x_max - x_min),
                                                    height=int(y_max - y_min)
                                                )
                                            ))
                                            total_confidence += confidence
                                            word_count += 1
                                else:
                                    # No bounding box info, create word details with dummy bbox
                                    for word in words:
                                        if word:  # Skip empty strings
                                            word_details.append(WordDetail(
                                                text=word,
                                                confidence=confidence,
                                                bbox=BoundingBox(x=0, y=0, width=0, height=0)
                                            ))
                                            total_confidence += confidence
                                            word_count += 1
                    else:
                        logger.warning("No rec_texts found in res data")
                else:
                    logger.warning("No 'res' key found in JSON data")
            else:
                # Fallback for older PaddleOCR format or direct result
                logger.info("No json attribute found, trying direct result parsing")

                # Try to parse as old format: list of [bbox, (text, confidence)]
                if isinstance(first_result, list):
                    for line in first_result:
                        if len(line) >= 2:
                            bbox_coords = line[0]  # [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
                            text_info = line[1]    # (text, confidence)

                            if len(text_info) >= 2:
                                text = text_info[0]
                                confidence = float(text_info[1])

                                if confidence >= MIN_CONFIDENCE:
                                    extracted_text += text + " "

                                    # Split text into individual words
                                    words = text.strip().split()

                                    # Calculate bounding box
                                    if bbox_coords and len(bbox_coords) >= 4:
                                        x_coords = [point[0] for point in bbox_coords]
                                        y_coords = [point[1] for point in bbox_coords]
                                        x_min, x_max = min(x_coords), max(x_coords)
                                        y_min, y_max = min(y_coords), max(y_coords)

                                        # Create word details for each word
                                        for word in words:
                                            if word:  # Skip empty strings
                                                word_details.append(WordDetail(
                                                    text=word,
                                                    confidence=confidence,
                                                    bbox=BoundingBox(
                                                        x=int(x_min),
                                                        y=int(y_min),
                                                        width=int(x_max - x_min),
                                                        height=int(y_max - y_min)
                                                    )
                                                ))
                                                total_confidence += confidence
                                                word_count += 1
                                    else:
                                        # Create word details for each word with dummy bbox
                                        for word in words:
                                            if word:  # Skip empty strings
                                                word_details.append(WordDetail(
                                                    text=word,
                                                    confidence=confidence,
                                                    bbox=BoundingBox(x=0, y=0, width=0, height=0)
                                                ))
                                                total_confidence += confidence
                                                word_count += 1
        
        # Calculate average confidence
        avg_confidence = total_confidence / word_count if word_count > 0 else 0.0
        
        # Calculate processing time
        processing_time = (datetime.now() - start_time).total_seconds()

        # Clean up memory after processing
        cleanup_memory()

        # Create result object
        result = OCRResult(
            text=extracted_text.strip(),
            confidence=avg_confidence,
            processing_time=processing_time,
            word_details=word_details,
            word_count=word_count
        )

        # Cache the result for future use
        cache_result(cache_key, result.model_dump())

        # Update performance metrics
        update_performance_metrics("request")
        update_performance_metrics("processing_time", processing_time)
        update_performance_metrics("image_processed")

        return result

    except Exception as e:
        # Update error metrics
        update_performance_metrics("error")

        # Enhanced error logging with context
        error_context = {
            "image_path": image_path,
            "preprocessing_options": options.model_dump() if options else None,
            "error_type": type(e).__name__,
            "error_message": str(e)
        }
        logger.error(f"OCR processing failed: {error_context}")

        # Clean up on error
        cleanup_memory()

        # Provide more specific error messages
        if "CUDA" in str(e) or "GPU" in str(e):
            error_detail = "GPU processing failed, falling back to CPU processing may resolve this issue"
        elif "memory" in str(e).lower() or "allocation" in str(e).lower():
            error_detail = "Insufficient memory for processing. Try reducing image size or restarting the service"
        elif "file" in str(e).lower() or "path" in str(e).lower():
            error_detail = f"File access error: {str(e)}"
        else:
            error_detail = f"OCR processing failed: {str(e)}"

        raise HTTPException(status_code=500, detail=error_detail)

@app.post("/ocr/image", response_model=OCRResult)
async def process_image_ocr_upload(
    file: UploadFile = File(...),
    enhance_contrast: bool = Form(False),
    denoise: bool = Form(False),
    threshold_method: str = Form("adaptive_gaussian"),
    apply_morphology: bool = Form(False)
):
    """
    Process OCR on an uploaded image file
    """
    try:
        # Validate file type
        if not file.content_type or not file.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="File must be an image")

        # Check file size
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File too large: {len(content)} bytes. Maximum allowed: {MAX_FILE_SIZE} bytes"
            )

        if len(content) == 0:
            raise HTTPException(status_code=400, detail="File is empty")

        # Create preprocessing options from form data
        preprocessing_options = PreprocessingOptions(
            enhance_contrast=enhance_contrast,
            denoise=denoise,
            threshold_method=threshold_method,
            apply_morphology=apply_morphology
        )

        # Save uploaded file temporarily
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.png')
        try:
            temp_file.write(content)
            temp_file.close()

            # Process OCR
            result = await perform_ocr_on_image(temp_file.name, preprocessing_options)
            return result

        finally:
            # Clean up temporary file
            try:
                os.unlink(temp_file.name)
            except:
                pass

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in process_image_ocr_upload: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.post("/ocr/image-path", response_model=OCRResult)
async def process_image_ocr_path(request: Request):
    """
    Process OCR on an image file by file path (for Tauri backend)
    """
    try:
        # Parse JSON request body
        body = await request.json()
        file_path = body.get("file_path")
        preprocessing_options_data = body.get("preprocessing_options", {})

        if not file_path:
            raise HTTPException(status_code=400, detail="file_path is required")

        # Validate file exists
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"Image file not found: {file_path}")

        # Validate file is an image
        if not any(file_path.lower().endswith(ext) for ext in SUPPORTED_IMAGE_FORMATS):
            raise HTTPException(status_code=400, detail="File must be an image")

        # Create preprocessing options
        preprocessing_options = PreprocessingOptions(**preprocessing_options_data)

        # Process OCR
        result = await perform_ocr_on_image(file_path, preprocessing_options)
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in process_image_ocr_path: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/ocr/video", response_model=Dict[str, Any])
async def process_video_ocr(request: Request):
    """
    Process a video file for OCR with text deduplication
    """
    # Initialize variables for error handling
    file_path = None
    video_options = None
    preprocessing_options = None

    try:
        # Parse JSON request body
        body = await request.json()
        file_path = body.get("file_path")
        video_options_data = body.get("video_options", {})
        preprocessing_options_data = body.get("preprocessing_options", {})

        # Validate file path
        if not file_path or not isinstance(file_path, str):
            raise HTTPException(status_code=400, detail="file_path is required")

        # Check if file exists
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"Video file not found: {file_path}")

        # Create options objects
        video_options = VideoProcessingOptions(**video_options_data) if video_options_data else None
        preprocessing_options = PreprocessingOptions(**preprocessing_options_data) if preprocessing_options_data else None

        # Check file size
        file_size = os.path.getsize(file_path)
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File too large: {file_size} bytes. Maximum allowed: {MAX_FILE_SIZE} bytes"
            )

        if file_size == 0:
            raise HTTPException(status_code=400, detail="Video file is empty")

        # Validate file format
        file_ext = Path(file_path).suffix.lower()
        if file_ext not in SUPPORTED_VIDEO_FORMATS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported video format: {file_ext}. Supported formats: {', '.join(SUPPORTED_VIDEO_FORMATS)}"
            )

        # Check if file is readable
        try:
            with open(file_path, 'rb') as f:
                # Try to read first few bytes to ensure file is accessible
                f.read(1024)
        except PermissionError:
            raise HTTPException(status_code=403, detail="Permission denied: Cannot read video file")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Cannot access video file: {str(e)}")

        # Use default options if none provided
        if video_options is None:
            video_options = VideoProcessingOptions()
        if preprocessing_options is None:
            preprocessing_options = PreprocessingOptions()

        # Validate video options
        if video_options.frame_interval < 1:
            video_options.frame_interval = 1
        if video_options.max_frames < 1:
            video_options.max_frames = 1
        if video_options.similarity_threshold < 0 or video_options.similarity_threshold > 1:
            video_options.similarity_threshold = 0.85
        if video_options.min_confidence < 0 or video_options.min_confidence > 1:
            video_options.min_confidence = 0.5

        start_time = datetime.now()

        # Extract frames from video
        frame_paths = extract_video_frames(file_path, video_options)

        if not frame_paths:
            raise HTTPException(status_code=400, detail="No frames could be extracted from video")

        # Process frames with optimized parallel processing
        all_texts = []
        frame_results = []

        # Process frames in batches for better memory management
        batch_size = 5  # Process 5 frames at a time
        total_batches = (len(frame_paths) + batch_size - 1) // batch_size

        logger.info(f"Processing {len(frame_paths)} frames in {total_batches} batches")

        for batch_idx in range(0, len(frame_paths), batch_size):
            batch_paths = frame_paths[batch_idx:batch_idx + batch_size]
            logger.debug(f"Processing batch {batch_idx // batch_size + 1}/{total_batches}")

            # Process batch in parallel
            batch_results = process_frame_batch(batch_paths, preprocessing_options)

            # Filter results by confidence and collect texts
            for result in batch_results:
                if result["text"] and result["confidence"] >= video_options.min_confidence:
                    all_texts.append(result["text"])
                    frame_results.append({
                        "frame_index": frame_paths.index(result["frame_path"]),
                        "text": result["text"],
                        "confidence": result["confidence"],
                        "word_count": result["word_count"]
                    })

            # Clean up processed batch frames immediately to save memory
            for frame_path in batch_paths:
                try:
                    os.unlink(frame_path)
                except:
                    pass

            # Memory cleanup after each batch
            cleanup_memory()

            logger.debug(f"Batch {batch_idx // batch_size + 1} completed, found {len(batch_results)} valid results")
        
        # Clean up any remaining frame files and directory
        if frame_paths:
            frames_dir = os.path.dirname(frame_paths[0])
            try:
                # Remove any remaining files and the directory
                shutil.rmtree(frames_dir, ignore_errors=True)
                logger.debug("Cleaned up frame directory")
            except Exception as e:
                logger.warning(f"Failed to clean up frame directory: {e}")
        
        # Deduplicate texts
        unique_texts = deduplicate_texts(all_texts, video_options.similarity_threshold)
        
        # Combine all unique texts
        combined_text = "\n".join(unique_texts)
        
        # Calculate overall confidence
        total_confidence = sum(frame["confidence"] for frame in frame_results)
        avg_confidence = total_confidence / len(frame_results) if frame_results else 0.0
        
        processing_time = (datetime.now() - start_time).total_seconds()

        # Update performance metrics
        update_performance_metrics("request")
        update_performance_metrics("processing_time", processing_time)
        update_performance_metrics("video_processed")
        for _ in frame_results:
            update_performance_metrics("frame_processed")

        return {
            "text": combined_text,
            "confidence": avg_confidence,
            "engine_used": "PaddleOCR",
            "processing_time": processing_time,
            "frames_processed": len(frame_paths),
            "frames_with_text": len(frame_results),
            "unique_text_segments": len(unique_texts),
            "frame_results": frame_results,
            "word_details": []  # Not applicable for video processing
        }

    except HTTPException:
        raise
    except Exception as e:
        # Update error metrics
        update_performance_metrics("error")

        # Enhanced error logging with context
        error_context = {
            "video_path": file_path,
            "video_options": video_options.model_dump() if video_options else None,
            "preprocessing_options": preprocessing_options.model_dump() if preprocessing_options else None,
            "error_type": type(e).__name__,
            "error_message": str(e)
        }
        logger.error(f"Video OCR processing failed: {error_context}")

        # Provide more specific error messages
        if "memory" in str(e).lower():
            error_detail = "Insufficient memory for video processing. Try reducing video size or frame interval"
        elif "codec" in str(e).lower() or "format" in str(e).lower():
            error_detail = f"Video format or codec error: {str(e)}"
        elif "permission" in str(e).lower():
            error_detail = "Permission denied accessing video file"
        else:
            error_detail = f"Video processing failed: {str(e)}"

        raise HTTPException(status_code=500, detail=error_detail)


@app.post("/ocr/batch", response_model=BatchOCRResult)
async def process_batch_ocr(request: BatchOCRRequest):
    """
    Process multiple small image files in a single batch request for improved performance
    """
    start_time = time.time()

    try:
        # Validate request
        if not request.files:
            raise HTTPException(status_code=400, detail="No files provided for batch processing")

        if len(request.files) > 50:  # Limit batch size
            raise HTTPException(status_code=400, detail="Batch size too large. Maximum 50 files per batch.")

        # Filter files by size threshold
        max_size_bytes = request.max_file_size_mb * 1024 * 1024
        valid_files = []

        for file_path in request.files:
            if not os.path.exists(file_path):
                logger.warning(f"File not found: {file_path}")
                continue

            file_size = os.path.getsize(file_path)
            if file_size <= max_size_bytes:
                valid_files.append(file_path)
            else:
                logger.warning(f"File too large for batch processing: {file_path} ({file_size} bytes)")

        if not valid_files:
            raise HTTPException(status_code=400, detail="No valid files found for batch processing")

        # Process files in parallel
        preprocessing_options = request.preprocessing_options or PreprocessingOptions()

        def process_single_file_sync(file_path: str) -> OCRResult:
            """Synchronous wrapper for async OCR processing"""
            try:
                import asyncio
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    result = loop.run_until_complete(perform_ocr_on_image(file_path, preprocessing_options))
                    # Create a new result with the file_path set
                    return OCRResult(
                        text=result.text,
                        confidence=result.confidence,
                        engine_used=result.engine_used,
                        processing_time=result.processing_time,
                        word_details=result.word_details,
                        word_count=len(result.word_details),
                        file_path=file_path,
                        success=True,
                        error_message=None,
                        metadata=result.metadata
                    )
                finally:
                    loop.close()
            except Exception as e:
                logger.error(f"Failed to process file {file_path}: {e}")
                return OCRResult(
                    text="",
                    confidence=0.0,
                    engine_used="PaddleOCR",
                    processing_time=0.0,
                    word_details=[],
                    word_count=0,
                    file_path=file_path,
                    success=False,
                    error_message=str(e),
                    metadata={}
                )

        # Process files in parallel using thread pool
        results = []
        if thread_pool:
            futures = [thread_pool.submit(process_single_file_sync, file_path) for file_path in valid_files]
            for future in futures:
                try:
                    result = future.result(timeout=60)  # 60 second timeout per file
                    results.append(result)
                except Exception as e:
                    logger.error(f"Batch processing timeout or error: {e}")
                    # Add error result
                    results.append(OCRResult(
                        text="",
                        confidence=0.0,
                        engine_used="PaddleOCR",
                        processing_time=0.0,
                        word_details=[],
                        word_count=0,
                        file_path="unknown",
                        success=False,
                        error_message=str(e),
                        metadata={}
                    ))
        else:
            # Fallback to sequential processing
            for file_path in valid_files:
                result = process_single_file_sync(file_path)
                results.append(result)

        total_processing_time = time.time() - start_time

        # Calculate statistics
        files_processed = sum(1 for r in results if getattr(r, 'success', True) and r.success)
        files_failed = len(results) - files_processed

        # Update performance metrics
        update_performance_metrics("batch_request")
        update_performance_metrics("batch_files_processed", len(valid_files))
        update_performance_metrics("processing_time", total_processing_time)

        logger.info(f"Batch processing completed: {files_processed} successful, {files_failed} failed in {total_processing_time:.2f}s")

        return BatchOCRResult(
            results=results,
            total_processing_time=total_processing_time,
            batch_size=len(valid_files),
            files_processed=files_processed,
            files_failed=files_failed
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in batch OCR: {e}")
        update_performance_metrics("error")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


# Document processing functions
def extract_text_from_pdf(file_path: str) -> str:
    """Extract text from PDF using pypdfium2"""
    try:
        pypdfium2 = get_pypdfium2()
        pdf = pypdfium2.PdfDocument(file_path)
        text_parts = []

        for page in pdf:
            textpage = page.get_textpage()
            text = textpage.get_text_range()
            if text.strip():
                text_parts.append(text.strip())

        pdf.close()
        return "\n\n".join(text_parts)
    except Exception as e:
        raise RuntimeError(f"Failed to extract text from PDF: {str(e)}")

def extract_text_from_docx(file_path: str) -> str:
    """Extract text from DOCX using docx2txt"""
    try:
        docx2txt = get_docx2txt()
        text = docx2txt.process(file_path)
        return text.strip() if text else ""
    except Exception as e:
        raise RuntimeError(f"Failed to extract text from DOCX: {str(e)}")

def extract_text_from_txt(file_path: str) -> str:
    """Extract text from TXT file"""
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            return file.read().strip()
    except UnicodeDecodeError:
        # Try with different encodings
        for encoding in ['latin-1', 'cp1252', 'iso-8859-1']:
            try:
                with open(file_path, 'r', encoding=encoding) as file:
                    return file.read().strip()
            except UnicodeDecodeError:
                continue
        raise RuntimeError("Failed to decode text file with any supported encoding")
    except Exception as e:
        raise RuntimeError(f"Failed to read text file: {str(e)}")

def extract_text_from_rtf(file_path: str) -> str:
    """Extract text from RTF using striprtf"""
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            rtf_content = file.read()
        rtf_to_text = get_striprtf()
        text = rtf_to_text(rtf_content)
        return text.strip() if text else ""
    except Exception as e:
        raise RuntimeError(f"Failed to extract text from RTF: {str(e)}")

def extract_text_from_document(file_path: str) -> DocumentExtractionResult:
    """Extract text from various document formats"""
    start_time = time.time()

    try:
        # Validate file exists
        if not os.path.exists(file_path):
            return DocumentExtractionResult(
                text="",
                file_path=file_path,
                file_type="unknown",
                processing_time=time.time() - start_time,
                success=False,
                error_message="File not found"
            )

        # Get file extension
        file_extension = Path(file_path).suffix.lower()

        # Extract text based on file type
        text = ""
        if file_extension == '.pdf':
            text = extract_text_from_pdf(file_path)
            file_type = "pdf"
        elif file_extension == '.docx':
            text = extract_text_from_docx(file_path)
            file_type = "docx"
        elif file_extension == '.txt':
            text = extract_text_from_txt(file_path)
            file_type = "txt"
        elif file_extension == '.rtf':
            text = extract_text_from_rtf(file_path)
            file_type = "rtf"
        else:
            return DocumentExtractionResult(
                text="",
                file_path=file_path,
                file_type=file_extension.lstrip('.'),
                processing_time=time.time() - start_time,
                success=False,
                error_message=f"Unsupported document format: {file_extension}"
            )

        processing_time = time.time() - start_time

        # Get file metadata
        file_stat = os.stat(file_path)
        metadata = {
            "file_size": file_stat.st_size,
            "last_modified": datetime.fromtimestamp(file_stat.st_mtime).isoformat(),
            "text_length": len(text),
            "word_count": len(text.split()) if text else 0
        }

        return DocumentExtractionResult(
            text=text,
            file_path=file_path,
            file_type=file_type,
            processing_time=processing_time,
            success=True,
            metadata=metadata
        )

    except Exception as e:
        return DocumentExtractionResult(
            text="",
            file_path=file_path,
            file_type=Path(file_path).suffix.lower().lstrip('.'),
            processing_time=time.time() - start_time,
            success=False,
            error_message=str(e)
        )

# DocumentExtractionRequest moved to models.py

@app.post("/extract/document", response_model=DocumentExtractionResult)
async def extract_document_text(request: DocumentExtractionRequest):
    """
    Extract text from various document formats (PDF, DOCX, TXT, RTF)
    """
    try:
        logger.info(f"Processing document extraction for: {request.file_path}")

        # Update metrics
        update_performance_metrics("request")

        # Perform document text extraction
        result = extract_text_from_document(request.file_path)

        # Update metrics
        update_performance_metrics("processing_time", result.processing_time)

        if result.success:
            logger.info(f"Successfully extracted {len(result.text)} characters from {request.file_path}")
        else:
            logger.warning(f"Failed to extract text from {request.file_path}: {result.error_message}")
            update_performance_metrics("error")

        return result

    except Exception as e:
        logger.error(f"Unexpected error in document extraction: {e}")
        update_performance_metrics("error")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.get("/health")
async def health_check(request: Request):
    """Enhanced health check endpoint with network information"""
    import socket

    # Get server network information
    hostname = socket.gethostname()
    try:
        local_ip = socket.gethostbyname(hostname)
    except:
        local_ip = "unknown"

    # Get client information
    client_host = request.client.host if request.client else "unknown"

    return {
        "status": "healthy",
        "service": "PaddleOCR Backend",
        "server_hostname": hostname,
        "server_ip": local_ip,
        "client_ip": client_host,
        "cors_enabled": True,
        "network_accessible": True,
        "timestamp": datetime.now().isoformat()
    }

@app.get("/network/info")
async def network_info(request: Request):
    """Network discovery endpoint for servers and other devices"""
    import socket

    interfaces = []

    try:
        # Try to use netifaces if available
        import netifaces

        # Get all network interfaces
        for interface in netifaces.interfaces():
            try:
                addrs = netifaces.ifaddresses(interface)
                if netifaces.AF_INET in addrs:
                    for addr in addrs[netifaces.AF_INET]:
                        if addr['addr'] != '127.0.0.1':
                            interfaces.append({
                                "interface": interface,
                                "ip": addr['addr'],
                                "netmask": addr.get('netmask', 'unknown')
                            })
            except Exception:
                continue

    except ImportError:
        # Fallback if netifaces is not available
        logger.debug("netifaces not available, using fallback network detection")

    # Fallback method if netifaces failed or is not available
    if not interfaces:
        try:
            hostname = socket.gethostname()
            local_ip = socket.gethostbyname(hostname)
            interfaces.append({
                "interface": "default",
                "ip": local_ip,
                "netmask": "unknown"
            })
        except Exception as e:
            logger.warning(f"Failed to get network info: {e}")
            interfaces.append({
                "interface": "unknown",
                "ip": "0.0.0.0",
                "netmask": "unknown"
            })

    return {
        "service": "PaddleOCR Backend",
        "version": "1.0.0",
        "network_interfaces": interfaces,
        "ports": {
            "http": 8000,
            "status": "active"
        },
        "capabilities": [
            "image_ocr",
            "video_ocr",
            "document_extraction",
            "batch_processing"
        ],
        "cors_enabled": True,
        "client_ip": request.client.host if request.client else "unknown",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/supported_formats")
async def get_supported_formats():
    """Get supported file formats"""
    return {
        "image_formats": SUPPORTED_IMAGE_FORMATS,
        "video_formats": SUPPORTED_VIDEO_FORMATS,
        "document_formats": SUPPORTED_DOCUMENT_FORMATS
    }

@app.get("/metrics")
async def get_performance_metrics():
    """Get performance metrics and statistics"""
    current_metrics = performance_metrics.get_copy()

    # Add current system metrics
    try:
        process = psutil.Process()
        memory_info = process.memory_info()
        current_metrics["current_memory_mb"] = memory_info.rss / 1024 / 1024
        current_metrics["memory_percent"] = process.memory_percent()
        current_metrics["cpu_percent"] = process.cpu_percent()

        # System metrics
        system_memory = psutil.virtual_memory()
        current_metrics["system_memory_available_mb"] = system_memory.available / 1024 / 1024
        current_metrics["system_memory_percent"] = system_memory.percent

        # Cache statistics
        current_metrics["cache_size"] = len(ocr_cache)
        current_metrics["cache_hit_rate"] = (
            current_metrics["cache_hits"] /
            (current_metrics["cache_hits"] + current_metrics["cache_misses"])
            if (current_metrics["cache_hits"] + current_metrics["cache_misses"]) > 0 else 0.0
        )

        # HTTP/2 and compression statistics
        current_metrics["http2_usage_rate"] = (
            current_metrics["http2_requests"] / current_metrics["total_requests"]
            if current_metrics["total_requests"] > 0 else 0.0
        )

        current_metrics["compression_rate"] = (
            current_metrics["compressed_responses"] / current_metrics["total_requests"]
            if current_metrics["total_requests"] > 0 else 0.0
        )

        current_metrics["average_compression_ratio"] = (
            current_metrics["compression_ratio_sum"] / current_metrics["compressed_responses"]
            if current_metrics["compressed_responses"] > 0 else 0.0
        )

        # Batch processing statistics
        current_metrics["batch_efficiency"] = (
            current_metrics["batch_files_processed"] / current_metrics["batch_requests"]
            if current_metrics["batch_requests"] > 0 else 0.0
        )

        # Response time statistics
        if current_metrics["request_response_times"]:
            response_times = current_metrics["request_response_times"]
            current_metrics["min_response_time"] = min(response_times)
            current_metrics["max_response_time"] = max(response_times)
            current_metrics["median_response_time"] = sorted(response_times)[len(response_times) // 2]
            current_metrics["p95_response_time"] = sorted(response_times)[int(len(response_times) * 0.95)]

        # Uptime
        current_metrics["uptime_seconds"] = time.time() - current_metrics["startup_time"]

    except Exception as e:
        logger.warning(f"Failed to get system metrics: {e}")

    return current_metrics

@app.get("/health/detailed")
async def detailed_health_check():
    """Detailed health check with system information"""
    try:
        process = psutil.Process()
        memory_info = process.memory_info()
        metrics_data = performance_metrics.get_copy()

        health_info = {
            "status": "healthy",
            "service": "PaddleOCR Backend",
            "ocr_initialized": ocr_instance is not None,
            "thread_pool_active": thread_pool is not None,
            "memory_usage_mb": memory_info.rss / 1024 / 1024,
            "memory_percent": process.memory_percent(),
            "cache_size": len(ocr_cache),
            "uptime_seconds": time.time() - metrics_data["startup_time"]
        }

        # Check if memory usage is concerning
        if health_info["memory_percent"] > 85:
            health_info["status"] = "warning"
            health_info["warning"] = "High memory usage detected"

        return health_info

    except Exception as e:
        return {
            "status": "error",
            "service": "PaddleOCR Backend",
            "error": str(e)
        }

# Global server instance for cleanup
server_instance = None

def signal_handler(signum, frame):
    """Handle shutdown signals gracefully"""
    logger.info(f"Received signal {signum}, shutting down gracefully...")
    if server_instance:
        server_instance.should_exit = True
    sys.exit(0)

def cleanup_on_exit():
    """Cleanup function called on exit"""
    logger.info("Performing cleanup on exit...")
    cleanup_memory()

# Register signal handlers and cleanup
signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)
atexit.register(cleanup_on_exit)

def main():
    """Main function with argument parsing"""
    import argparse

    parser = argparse.ArgumentParser(description="PaddleOCR Service")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind to")
    parser.add_argument("--log-level", default="info", help="Log level")
    parser.add_argument("--help-extended", action="store_true", help="Show extended help")

    args = parser.parse_args()

    if args.help_extended:
        print("PaddleOCR Service - Standalone OCR Backend")
        print("=========================================")
        print("")
        print("This service provides OCR functionality using PaddleOCR.")
        print("It supports both image and video processing with text deduplication.")
        print("")
        print("API Endpoints:")
        print("  GET  /health              - Health check")
        print("  GET  /supported_formats   - Get supported file formats")
        print("  POST /ocr/image          - Process image OCR")
        print("  POST /ocr/video          - Process video OCR")
        print("")
        print("The service will be available at: http://{}:{}".format(args.host, args.port))
        return

    logger.info("Starting PaddleOCR Service...")
    logger.info(f"Host: {args.host}, Port: {args.port}")
    logger.info(f"Log level: {args.log_level}")
    logger.info(f"Executable mode: {getattr(sys, 'frozen', False)}")

    try:
        # Run the server with HTTP/2 support using Hypercorn
        global server_instance

        # Try to use Hypercorn for HTTP/2 support
        try:
            import hypercorn.asyncio
            import hypercorn.config

            # Configure Hypercorn for HTTP/2
            hypercorn_config = hypercorn.config.Config()
            hypercorn_config.bind = [f"{args.host}:{args.port}"]
            # Fix: Use loglevel instead of log_level
            hypercorn_config.loglevel = args.log_level.upper()
            hypercorn_config.access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s"'
            hypercorn_config.accesslog = "-"  # Log to stdout

            logger.info("Starting server with HTTP/2 support using Hypercorn...")
            # Use asyncio.run to properly run the async server
            import asyncio
            # Fix: Use the ASGI app directly with proper typing
            from typing import cast
            from hypercorn.typing import ASGIFramework
            asyncio.run(hypercorn.asyncio.serve(cast(ASGIFramework, app), hypercorn_config))

        except (ImportError, TypeError) as e:
            logger.warning("Hypercorn not available, falling back to uvicorn (HTTP/1.1 only)")
            # Fallback to uvicorn
            config = uvicorn.Config(
                app,
                host=args.host,
                port=args.port,
                log_level=args.log_level,
                reload=False,
                access_log=True,
                http="h11"  # Explicitly use HTTP/1.1
            )
            server_instance = uvicorn.Server(config)
            server_instance.run()
        except Exception as e:
            logger.error(f"Failed to start with Hypercorn: {e}")
            logger.info("Falling back to uvicorn...")
            # Fallback to uvicorn on any error
            config = uvicorn.Config(
                app,
                host=args.host,
                port=args.port,
                log_level=args.log_level,
                reload=False,
                access_log=True,
                http="h11"
            )
            server_instance = uvicorn.Server(config)
            server_instance.run()

    except KeyboardInterrupt:
        logger.info("Service interrupted by user")
    except Exception as e:
        logger.error(f"Service error: {e}")
        sys.exit(1)
    finally:
        logger.info("PaddleOCR Service stopped")

if __name__ == "__main__":
    main()
