"""
Intelligent video processing using Structural Similarity Index (SSIM)
to extract only unique frames for OCR.
"""
import cv2
import tempfile
import logging
import os
import shutil
import time
import numpy as np
from skimage.metrics import structural_similarity as ssim

from typing import cast

from models import VideoProcessingOptions, PreprocessingOptions, VideoOCRResult
from core.ocr_processor import perform_ocr_on_image
from utils.performance import update_performance_metrics

logger = logging.getLogger(__name__)


def are_frames_similar(frame1_gray: np.ndarray, frame2_gray: np.ndarray, threshold: float) -> bool:
    """
    Compares two grayscale frames using SSIM.
    Returns True if the similarity score is above the threshold.
    """
    # Explicitly set full=False and gradient=False to ensure a float is returned at runtime.
    result = ssim(frame1_gray, frame2_gray, full=False, gradient=False)

    # Use cast() to inform Pylance that 'result' is a float, resolving the type ambiguity.
    # This has no runtime cost and is purely for static analysis.
    score = cast(float, result)

    # Now, this comparison is guaranteed to be safe in the eyes of the type checker.
    return score > threshold


def process_video_for_ocr(video_path: str, video_options: VideoProcessingOptions, ocr_options: PreprocessingOptions) -> VideoOCRResult:
    """
    Extracts unique frames from a video using SSIM, performs OCR, and returns combined text.
    This function is now more robust with full try/except/finally blocks.
    """
    start_time = time.time()
    frames_dir = tempfile.mkdtemp(prefix="video_frames_")

    # Initialize variables for the result
    all_texts = []
    total_confidence = 0.0
    frames_with_text = 0
    unique_frames_processed = 0
    frame_count = 0

    try:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return VideoOCRResult(
                text="",
                confidence=0.0,
                processing_time=time.time() - start_time,
                frames_processed=0,
                frames_with_text=0,
                unique_text_segments=0,
                success=False,
                error_message="Could not open video file."
            )

        previous_frame_gray = None

        while cap.isOpened() and unique_frames_processed < video_options.max_frames:
            ret, frame = cap.read()
            if not ret:
                break

            frame_count += 1
            if frame_count % video_options.frame_interval != 0:
                continue

            current_frame_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            # Resize for faster SSIM comparison
            current_frame_gray_small = cv2.resize(current_frame_gray, (320, 180), interpolation=cv2.INTER_AREA)

            if previous_frame_gray is None or not are_frames_similar(previous_frame_gray, current_frame_gray_small, video_options.similarity_threshold):
                unique_frames_processed += 1
                previous_frame_gray = current_frame_gray_small

                frame_path = os.path.join(frames_dir, f"frame_{unique_frames_processed:04d}.png")
                cv2.imwrite(frame_path, frame)

                ocr_result = perform_ocr_on_image(frame_path, ocr_options)

                if ocr_result.success and ocr_result.text and ocr_result.confidence >= video_options.min_confidence:
                    all_texts.append(ocr_result.text)
                    total_confidence += ocr_result.confidence
                    frames_with_text += 1

        cap.release()

        unique_texts = sorted(list(set(all_texts)), key=all_texts.index)
        combined_text = "\n".join(unique_texts)
        avg_confidence = (total_confidence / frames_with_text) if frames_with_text > 0 else 0.0

        update_performance_metrics("videos_processed")
        update_performance_metrics("frames_processed_from_videos", unique_frames_processed)

        return VideoOCRResult(
            text=combined_text,
            confidence=avg_confidence,
            processing_time=time.time() - start_time,
            frames_processed=unique_frames_processed,
            frames_with_text=frames_with_text,
            unique_text_segments=len(unique_texts),
            success=True,
            metadata={"total_frames_scanned_in_video": frame_count}
        )

    except Exception as e:
        logger.error(f"An unexpected error occurred during video processing for {video_path}: {e}", exc_info=True)
        return VideoOCRResult(
            text="",
            confidence=0.0,
            processing_time=time.time() - start_time,
            frames_processed=unique_frames_processed,
            frames_with_text=frames_with_text,
            unique_text_segments=len(all_texts),
            success=False,
            error_message=str(e)
        )

    finally:
        if os.path.exists(frames_dir):
            shutil.rmtree(frames_dir, ignore_errors=True)
            logger.debug(f"Cleaned up temporary directory: {frames_dir}")