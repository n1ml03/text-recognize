"""
Video processing utilities for frame extraction and analysis
"""
import os
import gc
import cv2
import tempfile
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
try:
    from .models import VideoFrameExtractionOptions, VideoProcessingOptions
except ImportError:
    # Handle case when running main.py directly
    from models import VideoFrameExtractionOptions, VideoProcessingOptions

logger = logging.getLogger(__name__)


def check_memory_usage() -> bool:
    """Check if memory usage is within acceptable limits"""
    try:
        import psutil
        memory_percent = psutil.virtual_memory().percent
        return memory_percent < 85  # Return False if memory usage > 85%
    except ImportError:
        return True  # If psutil not available, assume memory is OK


def extract_video_frames_standalone(video_path: str, options: VideoFrameExtractionOptions) -> Dict[str, Any]:
    """
    Enhanced video frame extraction for standalone use with configurable output directory
    and comprehensive metadata
    """
    start_time = datetime.now()
    
    try:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Could not open video: {video_path}")

        # Get video properties
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        duration = total_frames / fps if fps > 0 else 0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        logger.info(f"Video info: {total_frames} frames, {fps:.2f} FPS, {duration:.2f}s duration, {width}x{height}")

        # Create or use specified output directory
        if options.output_dir:
            frames_dir = options.output_dir
            os.makedirs(frames_dir, exist_ok=True)
        else:
            frames_dir = tempfile.mkdtemp(prefix="video_frames_")

        frame_paths = []
        previous_frame_hash = None

        # Calculate effective interval based on video length and max frames
        effective_interval = max(1, total_frames // options.max_frames) if total_frames > options.max_frames else options.frame_interval

        frame_count = 0
        extracted_count = 0
        skipped_similar = 0

        while cap.isOpened() and extracted_count < options.max_frames:
            ret, frame = cap.read()
            if not ret:
                break

            # Extract frame at specified interval
            if frame_count % effective_interval == 0:
                # Resize frame if too large to save memory
                original_height, original_width = frame.shape[:2]
                if original_width > options.resize_max_width or original_height > options.resize_max_height:
                    scale_factor = min(options.resize_max_width/original_width, options.resize_max_height/original_height)
                    new_width = int(original_width * scale_factor)
                    new_height = int(original_height * scale_factor)
                    frame = cv2.resize(frame, (new_width, new_height), interpolation=cv2.INTER_AREA)

                # Similarity detection to skip near-duplicate frames
                should_extract = True
                if options.enable_similarity_detection and previous_frame_hash is not None:
                    # Convert to grayscale for similarity comparison
                    gray_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                    # Calculate simple hash for similarity
                    frame_hash = cv2.mean(gray_frame)[0]
                    
                    # Check similarity with previous frame
                    if previous_frame_hash is not None:
                        similarity = 1.0 - abs(frame_hash - previous_frame_hash) / 255.0
                        if similarity > options.similarity_threshold:
                            should_extract = False
                            skipped_similar += 1
                    
                    previous_frame_hash = frame_hash

                if should_extract:
                    frame_path = os.path.join(frames_dir, f"frame_{extracted_count:06d}.jpg")
                    # Use configurable JPEG compression
                    cv2.imwrite(frame_path, frame, [cv2.IMWRITE_JPEG_QUALITY, options.jpeg_quality])
                    frame_paths.append(frame_path)
                    extracted_count += 1

                    # Batch processing for memory efficiency
                    if extracted_count % options.batch_size == 0:
                        # Force garbage collection every batch
                        gc.collect()

            frame_count += 1

            # Memory check during processing
            if frame_count % 100 == 0:
                if not check_memory_usage():
                    logger.warning("High memory usage during frame extraction, reducing quality")
                    break

        cap.release()
        
        processing_time = (datetime.now() - start_time).total_seconds()
        
        logger.info(f"Extracted {extracted_count} frames from video (skipped {skipped_similar} similar frames)")
        
        return {
            "frame_paths": frame_paths,
            "output_directory": frames_dir,
            "total_frames_extracted": extracted_count,
            "total_video_frames": total_frames,
            "processing_time": processing_time,
            "success": True,
            "metadata": {
                "video_duration": duration,
                "video_fps": fps,
                "video_resolution": f"{width}x{height}",
                "effective_interval": effective_interval,
                "skipped_similar_frames": skipped_similar,
                "compression_quality": options.jpeg_quality
            }
        }

    except Exception as e:
        processing_time = (datetime.now() - start_time).total_seconds()
        logger.error(f"Video frame extraction failed: {e}")
        return {
            "frame_paths": [],
            "output_directory": "",
            "total_frames_extracted": 0,
            "total_video_frames": 0,
            "processing_time": processing_time,
            "success": False,
            "error_message": str(e),
            "metadata": {}
        }


def extract_video_frames(video_path: str, options: VideoProcessingOptions) -> List[str]:
    """
    Original video frame extraction function for OCR processing (kept for backward compatibility)
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

        # Pre-allocate frame buffer for better memory management
        frame_buffer = []
        batch_size = 10  # Process frames in batches

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
