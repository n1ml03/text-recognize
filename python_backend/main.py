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

# --- Middleware Configuration ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1024)

@app.middleware("http")
async def performance_tracking_middleware(request: Request, call_next):
    """Middleware to track request processing time."""
    start_time = time.time()
    response = await call_next(request)
    processing_time = time.time() - start_time
    update_performance_metrics("total_requests")
    update_performance_metrics("total_processing_time", processing_time)
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
    """Returns detailed performance and system metrics."""
    metrics = performance_metrics.get_copy()
    process = psutil.Process()
    metrics["current_memory_mb"] = process.memory_info().rss / (1024 * 1024)
    metrics["cpu_percent"] = process.cpu_percent()
    return JSONResponse(content=metrics)


# --- Main execution block ---
if __name__ == "__main__":
    logger.info("Starting server with Uvicorn...")
    uvicorn.run(app, host="localhost", port=8000, log_level="info")