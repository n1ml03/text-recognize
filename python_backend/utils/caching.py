"""
Caching utilities for storing and retrieving OCR results.
"""
import time
import logging
import threading
from typing import Dict, Any, Optional

from .performance import update_performance_metrics
from config import CACHE_MAX_SIZE, CACHE_TTL_SECONDS

logger = logging.getLogger(__name__)

ocr_cache: Dict[str, Dict[str, Any]] = {}
cache_lock = threading.RLock()

def get_cached_result(cache_key: str) -> Optional[Dict]:
    """Get cached OCR result if available and not expired."""
    with cache_lock:
        cached_item = ocr_cache.get(cache_key)
        if cached_item:
            if time.time() - cached_item['timestamp'] < CACHE_TTL_SECONDS:
                logger.debug(f"Cache hit for key: {cache_key}")
                update_performance_metrics("cache_hit")
                return cached_item['result']
            else:
                del ocr_cache[cache_key]
                logger.debug(f"Cache expired for key: {cache_key}")

    update_performance_metrics("cache_miss")
    return None

def cache_result(cache_key: str, result: Dict):
    """Cache OCR result with a timestamp."""
    with cache_lock:
        if len(ocr_cache) >= CACHE_MAX_SIZE:
            try:
                # Remove the oldest entry
                oldest_key = min(ocr_cache.keys(), key=lambda k: ocr_cache[k]['timestamp'])
                del ocr_cache[oldest_key]
                logger.debug(f"Removed oldest cache entry: {oldest_key}")
            except ValueError:
                # Cache might be empty due to concurrent access
                pass

        ocr_cache[cache_key] = {
            'result': result,
            'timestamp': time.time()
        }
        logger.debug(f"Cached result for key: {cache_key}")

def clear_expired_cache():
    """Periodically clear all expired entries from the cache."""
    with cache_lock:
        current_time = time.time()
        expired_keys = [
            key for key, value in ocr_cache.items()
            if current_time - value['timestamp'] > CACHE_TTL_SECONDS
        ]
        for key in expired_keys:
            del ocr_cache[key]
        if expired_keys:
            logger.info(f"Cleared {len(expired_keys)} expired cache entries.")
