"""
High-performance caching utilities with compression and LRU eviction.
"""
import time
import logging
import threading
import pickle
import gzip
from collections import OrderedDict
from typing import Dict, Any, Optional
import hashlib

from .performance import update_performance_metrics
from config import CACHE_MAX_SIZE, CACHE_TTL_SECONDS

logger = logging.getLogger(__name__)

class CompressedLRUCache:
    """Thread-safe LRU cache with compression for OCR results."""
    
    def __init__(self, max_size: int = CACHE_MAX_SIZE, ttl_seconds: int = CACHE_TTL_SECONDS):
        self.max_size = max_size
        self.ttl_seconds = ttl_seconds
        self._cache = OrderedDict()
        self._lock = threading.RLock()
        self._compression_level = 6  # Good balance of speed vs compression ratio
        
    def _compress_data(self, data: Any) -> bytes:
        """Compress data using gzip for memory efficiency."""
        pickled_data = pickle.dumps(data)
        compressed_data = gzip.compress(pickled_data, compresslevel=self._compression_level)
        return compressed_data
    
    def _decompress_data(self, compressed_data: bytes) -> Any:
        """Decompress data back to original format."""
        decompressed_data = gzip.decompress(compressed_data)
        return pickle.loads(decompressed_data)
        
    def get(self, key: str) -> Optional[Dict]:
        """Get cached result if available and not expired."""
        with self._lock:
            if key not in self._cache:
                update_performance_metrics("cache_miss")
                return None
                
            cached_item = self._cache[key]
            current_time = time.time()
            
            # Check expiration
            if current_time - cached_item['timestamp'] > self.ttl_seconds:
                del self._cache[key]
                update_performance_metrics("cache_miss")
                logger.debug(f"Cache expired for key: {key[:16]}...")
                return None
            
            # Move to end (most recently used)
            self._cache.move_to_end(key)
            
            # Decompress and return
            try:
                result = self._decompress_data(cached_item['data'])
                update_performance_metrics("cache_hit")
                logger.debug(f"Cache hit for key: {key[:16]}...")
                return result
            except Exception as e:
                logger.error(f"Failed to decompress cache data: {e}")
                del self._cache[key]
                update_performance_metrics("cache_miss")
                return None
    
    def put(self, key: str, result: Dict):
        """Cache result with compression and LRU eviction."""
        with self._lock:
            try:
                # Compress the data
                compressed_data = self._compress_data(result)
                
                # Remove oldest entries if at capacity
                while len(self._cache) >= self.max_size:
                    oldest_key = next(iter(self._cache))
                    del self._cache[oldest_key]
                    logger.debug(f"LRU evicted cache entry: {oldest_key[:16]}...")
                
                # Add new entry
                self._cache[key] = {
                    'data': compressed_data,
                    'timestamp': time.time()
                }
                
                logger.debug(f"Cached compressed result for key: {key[:16]}...")
                
            except Exception as e:
                logger.error(f"Failed to cache result: {e}")
    
    def clear_expired(self):
        """Remove all expired entries."""
        with self._lock:
            current_time = time.time()
            expired_keys = [
                key for key, value in self._cache.items()
                if current_time - value['timestamp'] > self.ttl_seconds
            ]
            
            for key in expired_keys:
                del self._cache[key]
                
            if expired_keys:
                logger.info(f"Cleared {len(expired_keys)} expired cache entries")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        with self._lock:
            return {
                'cache_size': len(self._cache),
                'max_size': self.max_size,
                'ttl_seconds': self.ttl_seconds
            }

# Global cache instance
ocr_cache = CompressedLRUCache()
cache_lock = threading.RLock()  # Keep for backward compatibility

def get_cached_result(cache_key: str) -> Optional[Dict]:
    """Get cached OCR result if available and not expired."""
    return ocr_cache.get(cache_key)

def cache_result(cache_key: str, result: Dict):
    """Cache OCR result with compression and LRU eviction."""
    ocr_cache.put(cache_key, result)

def clear_expired_cache():
    """Periodically clear all expired entries from the cache."""
    ocr_cache.clear_expired()

def get_cache_stats() -> Dict[str, Any]:
    """Get detailed cache statistics for monitoring."""
    return ocr_cache.get_stats()
