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

# Optimized imports with functools.lru_cache for better performance
from functools import lru_cache
import difflib

# Lazy imports for better startup performance
_levenshtein = None
_pypdfium2 = None
_docx2txt = None
_striprtf = None

@lru_cache(maxsize=1)
def get_levenshtein():
    """Cached lazy import Levenshtein for text similarity calculations"""
    global _levenshtein
    if _levenshtein is None:
        import Levenshtein
        _levenshtein = Levenshtein
    return _levenshtein

@lru_cache(maxsize=1)
def get_pypdfium2():
    """Cached lazy import pypdfium2 for PDF processing"""
    global _pypdfium2
    if _pypdfium2 is None:
        import pypdfium2
        _pypdfium2 = pypdfium2
    return _pypdfium2

@lru_cache(maxsize=1)
def get_docx2txt():
    """Cached lazy import docx2txt for DOCX processing"""
    global _docx2txt
    if _docx2txt is None:
        import docx2txt
        _docx2txt = docx2txt
    return _docx2txt

@lru_cache(maxsize=1)
def get_striprtf():
    """Cached lazy import striprtf for RTF processing"""
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

# Enhanced file hashing with metadata
@lru_cache(maxsize=1000)
def get_file_hash(file_path: str) -> str:
    """Generate optimized hash for file caching with metadata"""
    try:
        stat = os.stat(file_path)
        hash_input = f"{file_path}_{stat.st_size}_{stat.st_mtime}_{stat.st_ino}"
        return hashlib.blake2b(hash_input.encode(), digest_size=16).hexdigest()
    except Exception:
        return hashlib.blake2b(file_path.encode(), digest_size=16).hexdigest()

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

# Configuration constants - enhanced
SUPPORTED_IMAGE_FORMATS = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif', '.webp', '.gif']
SUPPORTED_VIDEO_FORMATS = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm', '.m4v', '.3gp']
SUPPORTED_DOCUMENT_FORMATS = ['.pdf', '.docx', '.txt', '.rtf', '.doc']
MAX_FILE_SIZE = 200 * 1024 * 1024  # Increased to 200MB
SIMILARITY_THRESHOLD = 0.85
MIN_CONFIDENCE = 0.5

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
    """Enhanced OCR initialization with optimization"""
    global ocr_instance
    try:
        logger.info("Initializing PaddleOCR with optimized settings...")
        
        # Initialize with optimized settings for better performance
        ocr_instance = PaddleOCR(
            text_detection_model_name="PP-OCRv5_mobile_det",
            text_recognition_model_name="PP-OCRv5_mobile_rec",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )
        
        logger.info("PaddleOCR initialized successfully")
        cleanup_memory()
        
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

def enhanced_preprocess_image(image_path: str, options: PreprocessingOptions) -> str:
    """
    Enhanced image preprocessing pipeline that preserves quality while improving OCR accuracy
    """
    try:
        preprocessing_start = time.time()
        
        file_hash = get_file_hash(image_path)
        options_hash = hashlib.blake2b(str(options.model_dump()).encode(), digest_size=8).hexdigest()
        cache_key = f"preprocess_{file_hash}_{options_hash}"
        
        cached_result = get_cached_result(cache_key)
        if cached_result and os.path.exists(cached_result.get('path', '')):
            logger.debug(f"Using cached preprocessed image")
            return cached_result['path']
        
        # Read image with optimal settings
        img = cv2.imread(image_path, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError(f"Could not read image: {image_path}")
        
        height, width = img.shape[:2]
        logger.debug(f"Processing image: {width}x{height}")
        
        # Skip preprocessing if not needed
        if not any([options.enhance_contrast, options.denoise, options.apply_morphology,
                   options.threshold_method != "none"]):
            update_performance_metrics("preprocessing_time", time.time() - preprocessing_start)
            return image_path
        
        # Preserve original resolution - only resize if absolutely necessary
        max_dimension = 4000  # Increased from 2000 for better quality
        if width > max_dimension or height > max_dimension:
            scale_factor = max_dimension / max(width, height)
            new_width = int(width * scale_factor)
            new_height = int(height * scale_factor)
            img = cv2.resize(img, (new_width, new_height), interpolation=cv2.INTER_LANCZOS4)
            logger.debug(f"Resized image to {new_width}x{new_height} for processing")
        
        # Convert to grayscale with optimal method
        if len(img.shape) == 3:
            # Use weighted conversion for better text contrast
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        else:
            gray = img.copy()
        
        # Enhanced preprocessing pipeline
        if options.denoise:
            # Adaptive denoising based on image characteristics
            gray = cv2.bilateralFilter(gray, 9, 75, 75)
        
        if options.enhance_contrast:
            # Enhanced contrast using CLAHE with optimized parameters
            clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
            gray = clahe.apply(gray)
        
        # Enhanced thresholding
        if options.threshold_method == "adaptive_gaussian":
            gray = cv2.adaptiveThreshold(
                gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 
                blockSize=15, C=3  # Optimized parameters
            )
        elif options.threshold_method == "otsu":
            # Apply Gaussian blur before Otsu for better results
            gray = cv2.GaussianBlur(gray, (3, 3), 0)
            _, gray = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        elif options.threshold_method == "adaptive_mean":
            gray = cv2.adaptiveThreshold(
                gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 
                blockSize=15, C=3
            )
        
        if options.apply_morphology:
            # Enhanced morphological operations
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
            gray = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, kernel, iterations=1)
            gray = cv2.morphologyEx(gray, cv2.MORPH_OPEN, kernel, iterations=1)
        
        # Save with optimal compression settings
        temp_path = tempfile.mktemp(suffix='.png')
        cv2.imwrite(temp_path, gray, [cv2.IMWRITE_PNG_COMPRESSION, 3])  # Better compression
        
        # Cache the result
        cache_result(cache_key, {'path': temp_path})
        
        update_performance_metrics("preprocessing_time", time.time() - preprocessing_start)
        return temp_path
        
    except Exception as e:
        logger.error(f"Enhanced image preprocessing failed: {e}")
        update_performance_metrics("preprocessing_time", time.time() - preprocessing_start)
        return image_path

def extract_video_frames_optimized(video_path: str, options: VideoProcessingOptions) -> List[str]:
    """
    Optimized video frame extraction with intelligent sampling and enhanced memory management
    """
    try:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Could not open video: {video_path}")
        
        frames_dir = tempfile.mkdtemp(prefix="video_frames_optimized_")
        frame_paths = []
        frame_count = 0
        extracted_count = 0
        
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        duration = total_frames / fps if fps > 0 else 0
        
        logger.info(f"Processing video: {total_frames} frames, {fps:.1f} FPS, {duration:.1f}s duration")
        
        # Intelligent frame interval calculation
        if duration > 300:  # More than 5 minutes
            effective_interval = max(options.frame_interval, int(fps * 2))  # Extract every 2 seconds
        elif duration > 60:  # More than 1 minute
            effective_interval = max(options.frame_interval, int(fps))  # Extract every second
        else:
            effective_interval = options.frame_interval
        
        logger.info(f"Using frame interval: {effective_interval}")
        
        # Batch processing settings
        batch_size = 20  # Increased batch size
        frame_buffer = []
        
        while cap.isOpened() and extracted_count < options.max_frames:
            ret, frame = cap.read()
            if not ret:
                break
            
            if frame_count % effective_interval == 0:
                # Intelligent resizing - preserve aspect ratio
                height, width = frame.shape[:2]
                if width > 1920 or height > 1080:
                    scale_factor = min(1920/width, 1080/height)
                    new_width = int(width * scale_factor)
                    new_height = int(height * scale_factor)
                    frame = cv2.resize(frame, (new_width, new_height), interpolation=cv2.INTER_LANCZOS4)
                
                frame_buffer.append((frame, extracted_count))
                extracted_count += 1
                
                # Process batch when full
                if len(frame_buffer) >= batch_size:
                    for frame_data, idx in frame_buffer:
                        frame_path = os.path.join(frames_dir, f"frame_{idx:06d}.jpg")
                        cv2.imwrite(frame_path, frame_data, [cv2.IMWRITE_JPEG_QUALITY, 90])
                        frame_paths.append(frame_path)
                    
                    frame_buffer.clear()
                    gc.collect()  # Memory cleanup after batch
            
            frame_count += 1
            
            # Periodic memory check
            if frame_count % 200 == 0:
                if not check_memory_usage():
                    logger.warning("Memory pressure detected, reducing extraction quality")
                    break
        
        # Process remaining frames in buffer
        for frame_data, idx in frame_buffer:
            frame_path = os.path.join(frames_dir, f"frame_{idx:06d}.jpg")
            cv2.imwrite(frame_path, frame_data, [cv2.IMWRITE_JPEG_QUALITY, 90])
            frame_paths.append(frame_path)
        
        cap.release()
        logger.info(f"Extracted {len(frame_paths)} frames from video")
        return frame_paths
        
    except Exception as e:
        logger.error(f"Enhanced video frame extraction failed: {e}")
        raise

async def process_frame_batch_parallel(frame_paths: List[str], preprocessing_options: PreprocessingOptions) -> List[Dict]:
    """
    Enhanced parallel frame processing with better error handling and progress tracking
    """
    results = []
    
    def process_single_frame_sync(frame_path: str) -> Optional[Dict]:
        try:
            import asyncio
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                result = loop.run_until_complete(perform_ocr_on_image(frame_path, preprocessing_options))
                return {
                    "frame_path": frame_path,
                    "text": result.text.strip(),
                    "confidence": result.confidence,
                    "word_count": len(result.word_details),
                    "processing_time": result.processing_time
                }
            finally:
                loop.close()
        except Exception as e:
            logger.warning(f"Failed to process frame {os.path.basename(frame_path)}: {e}")
            return None
    
    # Enhanced parallel processing
    if thread_pool:
        # Process in smaller chunks for better memory management
        chunk_size = 5
        for i in range(0, len(frame_paths), chunk_size):
            chunk_paths = frame_paths[i:i + chunk_size]
            futures = [thread_pool.submit(process_single_frame_sync, path) for path in chunk_paths]
            
            for future in futures:
                try:
                    result = future.result(timeout=45)  # Increased timeout
                    if result and result["text"]:  # Only include frames with text
                        results.append(result)
                except Exception as e:
                    logger.warning(f"Frame processing error: {e}")
            
            # Memory cleanup after each chunk
            gc.collect()
    else:
        # Fallback sequential processing
        for frame_path in frame_paths:
            result = process_single_frame_sync(frame_path)
            if result and result["text"]:
                results.append(result)
    
    return results

# Enhanced text similarity using multiple algorithms
@lru_cache(maxsize=10000)
def calculate_text_similarity_cached(text1: str, text2: str) -> float:
    """Cached text similarity calculation with multiple algorithms"""
    if not text1 or not text2:
        return 0.0
    
    text1_norm = text1.strip().lower()
    text2_norm = text2.strip().lower()
    
    if text1_norm == text2_norm:
        return 1.0
    
    # Quick length-based filtering
    len1, len2 = len(text1_norm), len(text2_norm)
    if len1 == 0 or len2 == 0:
        return 0.0
    
    length_ratio = min(len1, len2) / max(len1, len2)
    if length_ratio < 0.3:
        return 0.0
    
    # Use difflib for fast similarity calculation
    similarity = difflib.SequenceMatcher(None, text1_norm, text2_norm).ratio()
    
    # Use Levenshtein for fine-tuning if available
    try:
        if similarity > 0.5:  # Only for promising candidates
            levenshtein = get_levenshtein()
            max_compare_len = 200
            text1_compare = text1_norm[:max_compare_len]
            text2_compare = text2_norm[:max_compare_len]
            
            distance = levenshtein.distance(text1_compare, text2_compare)
            max_len = max(len(text1_compare), len(text2_compare))
            levenshtein_sim = 1.0 - (distance / max_len) if max_len > 0 else 0.0
            
            # Combine similarities
            similarity = 0.3 * similarity + 0.7 * levenshtein_sim
    except:
        pass  # Fall back to difflib result
    
    return similarity

def deduplicate_texts_optimized(texts: List[str], threshold: float = SIMILARITY_THRESHOLD) -> List[str]:
    """Optimized text deduplication with clustering"""
    if not texts or len(texts) <= 1:
        return texts
    
    # Pre-filter very short texts
    filtered_texts = [text.strip() for text in texts if len(text.strip()) >= 3]
    if not filtered_texts:
        return []
    
    # Sort by length for better clustering
    texts_with_indices = [(text, i) for i, text in enumerate(filtered_texts)]
    texts_with_indices.sort(key=lambda x: len(x[0]), reverse=True)
    
    unique_texts = []
    processed_indices = set()
    
    for text, original_index in texts_with_indices:
        if original_index in processed_indices:
            continue
        
        is_duplicate = False
        for unique_text in unique_texts:
            similarity = calculate_text_similarity_cached(text, unique_text)
            if similarity >= threshold:
                is_duplicate = True
                break
        
        if not is_duplicate:
            unique_texts.append(text)
            processed_indices.add(original_index)
    
    return unique_texts

async def perform_ocr_on_image(image_path: str, options: PreprocessingOptions) -> OCRResult:
    """
    Simplified and optimized OCR function that directly extracts text from PaddleOCR results
    """
    start_time = time.time()
    
    try:
        # Generate cache key
        file_hash = get_file_hash(image_path)
        options_hash = hashlib.blake2b(str(options.model_dump()).encode(), digest_size=8).hexdigest()
        cache_key = f"ocr_{file_hash}_{options_hash}"
        
        # Check cache
        cached_result = get_cached_result(cache_key)
        if cached_result:
            logger.debug(f"Returning cached OCR result")
            return OCRResult(**cached_result)
        
        # Memory check
        if not check_memory_usage():
            cleanup_memory(force_full_gc=True)
        
        # Preprocess image if needed
        processed_image_path = image_path
        if any([options.enhance_contrast, options.denoise, options.apply_morphology, 
                options.threshold_method != "none"]):
            processed_image_path = enhanced_preprocess_image(image_path, options)
        
        # Perform OCR
        if ocr_instance is None:
            raise RuntimeError("OCR instance not initialized")
        
        # Use PaddleOCR's standard ocr method - it returns the correct format directly
        result = ocr_instance.ocr(processed_image_path)
        
        # Clean up preprocessed image
        if processed_image_path != image_path:
            try:
                os.unlink(processed_image_path)
            except:
                pass
        
        # Process results - simplified extraction since PaddleOCR returns standard format
        extracted_text = ""
        word_details = []
        total_confidence = 0.0
        word_count = 0
        
        if result and result[0]:  # Check if OCR found any text
            for line in result[0]:
                if len(line) >= 2:
                    bbox_coords = line[0]  # Bounding box coordinates
                    text_data = line[1]    # (text, confidence)
                    
                    if len(text_data) >= 2:
                        text = text_data[0].strip()
                        confidence = float(text_data[1])
                        
                        if confidence >= MIN_CONFIDENCE and text:
                            extracted_text += text + " "
                            
                            # Calculate bounding box
                            if bbox_coords and len(bbox_coords) >= 4:
                                x_coords = [point[0] for point in bbox_coords]
                                y_coords = [point[1] for point in bbox_coords]
                                x_min, x_max = min(x_coords), max(x_coords)
                                y_min, y_max = min(y_coords), max(y_coords)
                                
                                # Create word details for the entire text region
                                words = text.split()
                                for word in words:
                                    if word:
                                        word_details.append(WordDetail(
                                            text=word,
                                            confidence=confidence,
                                            bbox=BoundingBox(
                                                x=int(x_min), y=int(y_min),
                                                width=int(x_max - x_min), height=int(y_max - y_min)
                                            )
                                        ))
                                        total_confidence += confidence
                                        word_count += 1
        
        # Calculate metrics
        avg_confidence = total_confidence / word_count if word_count > 0 else 0.0
        processing_time = time.time() - start_time
        
        # Create result
        result = OCRResult(
            text=extracted_text.strip(),
            confidence=avg_confidence,
            processing_time=processing_time,
            word_details=word_details,
            word_count=word_count,
            file_path=image_path,
            success=True,
            metadata={"ocr_engine": "PaddleOCR", "preprocessing_applied": any([
                options.enhance_contrast, options.denoise, options.apply_morphology,
                options.threshold_method != "none"
            ])}
        )
        
        # Cache result
        cache_result(cache_key, result.model_dump())
        
        # Update metrics
        update_performance_metrics("request")
        update_performance_metrics("processing_time", processing_time)
        update_performance_metrics("image_processed")
        
        cleanup_memory()
        return result
        
    except Exception as e:
        update_performance_metrics("error")
        logger.error(f"OCR processing failed for {image_path}: {e}")
        
        cleanup_memory()
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")

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
    """Enhanced image OCR processing by file path"""
    try:
        body = await request.json()
        file_path = body.get("file_path")
        preprocessing_options_data = body.get("preprocessing_options", {})
        
        if not file_path:
            raise HTTPException(status_code=400, detail="file_path is required")
        
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"Image file not found: {file_path}")
        
        # Enhanced file validation
        file_ext = Path(file_path).suffix.lower()
        if file_ext not in SUPPORTED_IMAGE_FORMATS:
            raise HTTPException(status_code=400, detail=f"Unsupported format: {file_ext}")
        
        preprocessing_options = PreprocessingOptions(**preprocessing_options_data)
        result = await perform_ocr_on_image(file_path, preprocessing_options)
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Enhanced image path OCR error: {e}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

@app.post("/ocr/multi-file", response_model=Dict[str, Any])
async def process_multi_file_ocr(request: Request):
    """Process multiple files of different types (images, videos, documents) simultaneously"""
    try:
        body = await request.json()
        file_paths = body.get("file_paths", [])
        preprocessing_options_data = body.get("preprocessing_options", {})
        video_options_data = body.get("video_options", {})
        
        if not file_paths:
            raise HTTPException(status_code=400, detail="file_paths is required")
        
        if len(file_paths) > 50:  # Limit for safety
            raise HTTPException(status_code=400, detail="Too many files. Maximum 50 files per request.")
        
        preprocessing_options = PreprocessingOptions(**preprocessing_options_data)
        video_options = VideoProcessingOptions(**video_options_data)
        
        # Categorize files by type
        image_files = []
        video_files = []
        document_files = []
        unsupported_files = []
        
        for file_path in file_paths:
            if not os.path.exists(file_path):
                logger.warning(f"File not found: {file_path}")
                continue
                
            file_ext = Path(file_path).suffix.lower()
            if file_ext in SUPPORTED_IMAGE_FORMATS:
                image_files.append(file_path)
            elif file_ext in SUPPORTED_VIDEO_FORMATS:
                video_files.append(file_path)
            elif file_ext in SUPPORTED_DOCUMENT_FORMATS:
                document_files.append(file_path)
            else:
                unsupported_files.append(file_path)
        
        # Process files concurrently by type
        start_time = time.time()
        results = {
            "image_results": [],
            "video_results": [],
            "document_results": [],
            "unsupported_files": unsupported_files,
            "summary": {}
        }
        
        # Process images in batch
        if image_files:
            logger.info(f"Processing {len(image_files)} image files")
            for file_path in image_files:
                try:
                    result = await perform_ocr_on_image(file_path, preprocessing_options)
                    results["image_results"].append({
                        "file_path": file_path,
                        "result": result.model_dump()
                    })
                except Exception as e:
                    logger.error(f"Failed to process image {file_path}: {e}")
                    results["image_results"].append({
                        "file_path": file_path,
                        "error": str(e)
                    })
        
        # Process documents
        if document_files:
            logger.info(f"Processing {len(document_files)} document files")
            for file_path in document_files:
                try:
                    result = extract_text_from_document_enhanced(file_path)
                    results["document_results"].append({
                        "file_path": file_path,
                        "result": result.model_dump()
                    })
                except Exception as e:
                    logger.error(f"Failed to process document {file_path}: {e}")
                    results["document_results"].append({
                        "file_path": file_path,
                        "error": str(e)
                    })
        
        # Process videos (simplified for multi-file processing)
        if video_files:
            logger.info(f"Processing {len(video_files)} video files")
            for file_path in video_files:
                try:
                    # Use simpler video processing for multi-file requests
                    frame_paths = extract_video_frames_optimized(file_path, video_options)
                    if frame_paths:
                        # Process only first few frames for quick results
                        sample_frames = frame_paths[:5]  # Limit to 5 frames
                        frame_results = await process_frame_batch_parallel(sample_frames, preprocessing_options)
                        
                        # Clean up frames
                        for frame_path in frame_paths:
                            try:
                                os.unlink(frame_path)
                            except:
                                pass
                        
                        # Extract text from frame results
                        all_texts = [r["text"] for r in frame_results if r["text"]]
                        unique_texts = deduplicate_texts_optimized(all_texts, video_options.similarity_threshold)
                        combined_text = "\n".join(unique_texts)
                        
                        results["video_results"].append({
                            "file_path": file_path,
                            "result": {
                                "text": combined_text,
                                "frames_processed": len(sample_frames),
                                "frames_with_text": len(frame_results),
                                "unique_segments": len(unique_texts)
                            }
                        })
                    else:
                        results["video_results"].append({
                            "file_path": file_path,
                            "error": "No frames could be extracted"
                        })
                        
                except Exception as e:
                    logger.error(f"Failed to process video {file_path}: {e}")
                    results["video_results"].append({
                        "file_path": file_path,
                        "error": str(e)
                    })
        
        processing_time = time.time() - start_time
        
        # Generate summary
        results["summary"] = {
            "total_files": len(file_paths),
            "images_processed": len([r for r in results["image_results"] if "result" in r]),
            "videos_processed": len([r for r in results["video_results"] if "result" in r]),
            "documents_processed": len([r for r in results["document_results"] if "result" in r]),
            "unsupported_files": len(unsupported_files),
            "total_processing_time": processing_time,
            "files_with_errors": len([r for r in results["image_results"] + results["video_results"] + results["document_results"] if "error" in r])
        }
        
        # Update metrics
        update_performance_metrics("request")
        update_performance_metrics("processing_time", processing_time)
        
        logger.info(f"Multi-file processing completed: {results['summary']}")
        return results
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Multi-file processing error: {e}")
        raise HTTPException(status_code=500, detail=f"Multi-file processing failed: {str(e)}")

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
        frame_paths = extract_video_frames_optimized(file_path, video_options)

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
            batch_results = await process_frame_batch_parallel(batch_paths, preprocessing_options)

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
        unique_texts = deduplicate_texts_optimized(all_texts, video_options.similarity_threshold)
        
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


# Enhanced document processing functions
def extract_text_from_pdf_enhanced(file_path: str) -> str:
    """Enhanced PDF text extraction with better error handling"""
    try:
        pypdfium2 = get_pypdfium2()
        pdf = pypdfium2.PdfDocument(file_path)
        text_parts = []
        
        for page_num, page in enumerate(pdf):
            try:
                textpage = page.get_textpage()
                text = textpage.get_text_range()
                if text.strip():
                    text_parts.append(f"--- Page {page_num + 1} ---\n{text.strip()}")
            except Exception as e:
                logger.warning(f"Failed to extract text from page {page_num + 1}: {e}")
                continue
        
        pdf.close()
        return "\n\n".join(text_parts)
    except Exception as e:
        raise RuntimeError(f"Enhanced PDF extraction failed: {str(e)}")

def extract_text_from_docx_enhanced(file_path: str) -> str:
    """Enhanced DOCX text extraction"""
    try:
        docx2txt = get_docx2txt()
        text = docx2txt.process(file_path)
        return text.strip() if text else ""
    except Exception as e:
        raise RuntimeError(f"Enhanced DOCX extraction failed: {str(e)}")

def extract_text_from_txt_enhanced(file_path: str) -> str:
    """Enhanced TXT file extraction with encoding detection"""
    try:
        # Try to detect encoding
        import chardet
        with open(file_path, 'rb') as file:
            raw_data = file.read()
            encoding_result = chardet.detect(raw_data)
            encoding = encoding_result['encoding'] or 'utf-8'
        
        with open(file_path, 'r', encoding=encoding) as file:
            return file.read().strip()
    except ImportError:
        # Fallback without chardet
        for encoding in ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']:
            try:
                with open(file_path, 'r', encoding=encoding) as file:
                    return file.read().strip()
            except UnicodeDecodeError:
                continue
        raise RuntimeError("Failed to decode text file with any supported encoding")
    except Exception as e:
        raise RuntimeError(f"Enhanced TXT extraction failed: {str(e)}")

def extract_text_from_rtf_enhanced(file_path: str) -> str:
    """Enhanced RTF text extraction"""
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            rtf_content = file.read()
        rtf_to_text = get_striprtf()
        text = rtf_to_text(rtf_content)
        return text.strip() if text else ""
    except Exception as e:
        raise RuntimeError(f"Enhanced RTF extraction failed: {str(e)}")

def extract_text_from_document_enhanced(file_path: str) -> DocumentExtractionResult:
    """Enhanced document text extraction with better metadata"""
    start_time = time.time()
    
    try:
        if not os.path.exists(file_path):
            return DocumentExtractionResult(
                text="", file_path=file_path, file_type="unknown",
                processing_time=time.time() - start_time, success=False,
                error_message="File not found"
            )
        
        file_extension = Path(file_path).suffix.lower()
        text = ""
        
        # Enhanced extraction based on file type
        if file_extension == '.pdf':
            text = extract_text_from_pdf_enhanced(file_path)
            file_type = "pdf"
        elif file_extension in ['.docx', '.doc']:
            text = extract_text_from_docx_enhanced(file_path)
            file_type = "docx"
        elif file_extension == '.txt':
            text = extract_text_from_txt_enhanced(file_path)
            file_type = "txt"
        elif file_extension == '.rtf':
            text = extract_text_from_rtf_enhanced(file_path)
            file_type = "rtf"
        else:
            return DocumentExtractionResult(
                text="", file_path=file_path, file_type=file_extension.lstrip('.'),
                processing_time=time.time() - start_time, success=False,
                error_message=f"Unsupported document format: {file_extension}"
            )
        
        processing_time = time.time() - start_time
        
        # Enhanced metadata
        file_stat = os.stat(file_path)
        word_count = len(text.split()) if text else 0
        line_count = len(text.splitlines()) if text else 0
        
        metadata = {
            "file_size": file_stat.st_size,
            "last_modified": datetime.fromtimestamp(file_stat.st_mtime).isoformat(),
            "text_length": len(text),
            "word_count": word_count,
            "line_count": line_count,
            "extraction_method": "enhanced",
            "file_extension": file_extension
        }
        
        return DocumentExtractionResult(
            text=text, file_path=file_path, file_type=file_type,
            processing_time=processing_time, success=True, metadata=metadata
        )
        
    except Exception as e:
        return DocumentExtractionResult(
            text="", file_path=file_path,
            file_type=Path(file_path).suffix.lower().lstrip('.'),
            processing_time=time.time() - start_time, success=False,
            error_message=str(e)
        )

# DocumentExtractionRequest moved to models.py

@app.post("/extract/document", response_model=DocumentExtractionResult)
async def extract_document_text_enhanced(request: DocumentExtractionRequest):
    """Enhanced document text extraction endpoint"""
    try:
        logger.info(f"Enhanced document extraction for: {request.file_path}")
        
        update_performance_metrics("request")
        result = extract_text_from_document_enhanced(request.file_path)
        update_performance_metrics("processing_time", result.processing_time)
        
        if result.success:
            update_performance_metrics("document_processed")
            logger.info(f"Successfully extracted {len(result.text)} characters from {request.file_path}")
        else:
            update_performance_metrics("error")
            logger.warning(f"Document extraction failed: {result.error_message}")
        
        return result
        
    except Exception as e:
        logger.error(f"Enhanced document extraction error: {e}")
        update_performance_metrics("error")
        raise HTTPException(status_code=500, detail=f"Document processing failed: {str(e)}")

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
async def get_supported_formats_enhanced():
    """Enhanced supported formats endpoint"""
    return {
        "image_formats": SUPPORTED_IMAGE_FORMATS,
        "video_formats": SUPPORTED_VIDEO_FORMATS,
        "document_formats": SUPPORTED_DOCUMENT_FORMATS,
        "max_file_size_mb": MAX_FILE_SIZE / (1024 * 1024),
        "capabilities": {
            "image_ocr": True,
            "video_ocr": True,
            "batch_processing": True,
            "document_extraction": True,
            "text_preprocessing": True,
            "similarity_detection": True,
            "caching": True,
            "parallel_processing": True,
            "multi_file_processing": True
        }
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
