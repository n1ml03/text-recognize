"""
Performance metrics tracking utilities.
"""
import time
import threading
from typing import Dict, Any, Union

class PerformanceMetrics:
    """Thread-safe container for performance metrics."""

    def __init__(self):
        self._lock = threading.RLock()
        self._data: Dict[str, Any] = {
            "total_requests": 0,
            "cache_hits": 0,
            "cache_misses": 0,
            "total_processing_time": 0.0,
            "average_processing_time": 0.0,
            "error_count": 0,
            "images_processed": 0,
            "videos_processed": 0,
            "documents_processed": 0,
            "frames_processed_from_videos": 0,
            "startup_time": time.time(),
        }

    def increment(self, key: str, value: Union[int, float] = 1):
        with self._lock:
            if key in self._data:
                self._data[key] += value

    def get_copy(self) -> Dict[str, Any]:
        with self._lock:
            return self._data.copy()

    def update_average_time(self):
        with self._lock:
            if self._data["total_requests"] > 0:
                self._data["average_processing_time"] = self._data["total_processing_time"] / self._data["total_requests"]

performance_metrics = PerformanceMetrics()

def update_performance_metrics(metric_name: str, value: Any = 1):
    """Update performance metrics thread-safely."""
    performance_metrics.increment(metric_name, value)
    if metric_name == "processing_time":
        performance_metrics.update_average_time()