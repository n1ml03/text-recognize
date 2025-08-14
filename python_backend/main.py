"""
Main entry point for the high-performance PaddleOCR FastAPI service.
Initializes the application, middleware, and API routers.
"""
import logging
import sys
import time
from contextlib import asynccontextmanager
import uvicorn
import psutil

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.responses import JSONResponse

# Import core components and routers
from core.ocr_instance import initialize_ocr, is_ocr_initialized
from api import main_router, video_router
from utils.performance import performance_metrics, update_performance_metrics

# --- Logging Configuration ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger(__name__)


# --- Application Lifespan (Startup/Shutdown Events) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manages application startup and shutdown events."""
    logger.info("--- Service Starting Up ---")
    try:
        initialize_ocr()
        logger.info("OCR initialization completed successfully")
    except Exception as e:
        logger.error(f"Failed to initialize OCR during startup: {e}")
        logger.error("Service will continue, but OCR functionality will not be available")
        # Don't exit here - let the service start and provide proper error messages
    yield
    logger.info("--- Service Shutting Down ---")


# --- FastAPI Application Initialization ---
app = FastAPI(
    title="High-Performance PaddleOCR Service",
    description="An optimized OCR service using FastAPI and PaddleOCR with advanced processing.",
    version="2.0.0",
    lifespan=lifespan
)

# --- Optimized Middleware Configuration ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=512)  # More aggressive compression

@app.middleware("http")
async def enhanced_performance_middleware(request: Request, call_next):
    """Enhanced middleware for performance tracking and optimization."""
    start_time = time.time()
    
    # Add performance headers
    response = await call_next(request)
    
    processing_time = time.time() - start_time
    
    # Update metrics
    update_performance_metrics("total_requests")
    update_performance_metrics("total_processing_time", processing_time)
    
    # Add performance headers to response
    response.headers["X-Processing-Time"] = f"{processing_time:.4f}s"
    response.headers["X-Server-Version"] = "2.0.0-optimized"
    
    # Log slow requests
    if processing_time > 2.0:  # Log requests taking more than 2 seconds
        logger.warning(f"Slow request: {request.method} {request.url.path} took {processing_time:.2f}s")
    
    return response

@app.middleware("http")
async def cache_cleanup_middleware(request: Request, call_next):
    """Periodically clean up expired cache entries."""
    from utils.caching import clear_expired_cache
    import random
    
    # Randomly trigger cache cleanup (1% chance per request)
    if random.random() < 0.01:
        try:
            clear_expired_cache()
        except Exception as e:
            logger.warning(f"Cache cleanup failed: {e}")
    
    response = await call_next(request)
    return response


# --- API Routers ---
app.include_router(main_router.router, tags=["Image & Document OCR"])
app.include_router(video_router.router)


# --- Health and Metrics Endpoints ---
@app.get("/health", tags=["System"])
async def health_check():
    """Provides a simple health check for the service."""
    ocr_status = "initialized" if is_ocr_initialized() else "not_initialized"
    return {
        "status": "ok", 
        "message": "Service is running",
        "ocr_status": ocr_status
    }

@app.get("/metrics", tags=["System"])
async def get_metrics():
    """Returns comprehensive performance and system metrics."""
    from utils.caching import get_cache_stats
    from core.ocr_instance import get_ocr_stats
    
    metrics = performance_metrics.get_copy()
    process = psutil.Process()
    
    # System metrics
    metrics["current_memory_mb"] = process.memory_info().rss / (1024 * 1024)
    metrics["cpu_percent"] = process.cpu_percent()
    metrics["memory_percent"] = process.memory_percent()
    
    # OCR instance metrics
    metrics["ocr_stats"] = get_ocr_stats()
    
    # Cache metrics
    metrics["cache_stats"] = get_cache_stats()
    
    # Calculate derived metrics
    if metrics["total_requests"] > 0:
        # Safely calculate cache hit rate to avoid division by zero
        total_cache_operations = metrics["cache_hits"] + metrics["cache_misses"]
        metrics["cache_hit_rate"] = metrics["cache_hits"] / total_cache_operations if total_cache_operations > 0 else 0
        metrics["error_rate"] = metrics["error_count"] / metrics["total_requests"]
        metrics["average_processing_time"] = metrics["total_processing_time"] / metrics["total_requests"]
    else:
        metrics["cache_hit_rate"] = 0
        metrics["error_rate"] = 0
        metrics["average_processing_time"] = 0
    
    # Uptime
    metrics["uptime_seconds"] = time.time() - metrics["startup_time"]
    
    return JSONResponse(content=metrics)


# --- Main execution block ---
if __name__ == "__main__":
    logger.info("Starting server with Uvicorn...")
    uvicorn.run(app, host="localhost", port=8000, log_level="info")