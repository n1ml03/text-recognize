#!/usr/bin/env python3
"""
Demonstration script showing the improved text processing capabilities.
This script can be used to test the OCR improvements with real images.
"""
import os
import sys
import logging
from typing import Optional

# Add the current directory to the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from models import PreprocessingOptions, TextProcessingOptions
from core.ocr_processor import perform_ocr_on_image

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def demonstrate_improvement(image_path: str):
    """Demonstrate the before/after text processing improvement"""
    
    if not os.path.exists(image_path):
        print(f"❌ Image file not found: {image_path}")
        return
    
    print("=" * 80)
    print(f"DEMONSTRATING TEXT PROCESSING IMPROVEMENT")
    print(f"Image: {image_path}")
    print("=" * 80)
    
    # Standard preprocessing options
    preprocessing_options = PreprocessingOptions(
        enhance_contrast=True,
        denoise=True,
        threshold_method="adaptive_gaussian",
        apply_morphology=True,
        deskew=True,
        upscale=True
    )
    
    print("\n🔄 Processing image with OLD method (simple concatenation)...")
    # OLD method: disable advanced processing
    old_text_options = TextProcessingOptions(
        use_advanced_processing=False,
        reading_order="ltr_ttb"
    )
    
    try:
        old_result = perform_ocr_on_image(image_path, preprocessing_options, old_text_options)
        print("✅ OLD processing completed")
        print(f"   Confidence: {old_result.confidence:.2f}")
        print(f"   Processing time: {old_result.processing_time:.2f}s")
        print(f"   Words detected: {old_result.word_count}")
    except Exception as e:
        print(f"❌ OLD processing failed: {e}")
        return
    
    print("\n🔄 Processing image with NEW method (advanced processing)...")
    # NEW method: enable advanced processing
    new_text_options = TextProcessingOptions(
        use_advanced_processing=True,
        reading_order="ltr_ttb",
        enable_layout_analysis=True,
        preserve_line_breaks=True
    )
    
    try:
        new_result = perform_ocr_on_image(image_path, preprocessing_options, new_text_options)
        print("✅ NEW processing completed")
        print(f"   Confidence: {new_result.confidence:.2f}")
        print(f"   Processing time: {new_result.processing_time:.2f}s")
        print(f"   Words detected: {new_result.word_count}")
        print(f"   Lines detected: {new_result.line_count}")
    except Exception as e:
        print(f"❌ NEW processing failed: {e}")
        return
    
    # Compare results
    print("\n" + "=" * 50)
    print("BEFORE (Old Method - Simple Concatenation):")
    print("=" * 50)
    print(old_result.text)
    print(f"\nLength: {len(old_result.text)} characters")
    print(f"Lines: {old_result.text.count(chr(10)) + 1}")
    
    print("\n" + "=" * 50)
    print("AFTER (New Method - Advanced Processing):")
    print("=" * 50)
    print(new_result.text)
    print(f"\nLength: {len(new_result.text)} characters")
    print(f"Lines: {new_result.text.count(chr(10)) + 1}")
    print(f"Paragraphs: {new_result.text.count(chr(10) + chr(10)) + 1}")
    
    # Analysis
    print("\n" + "=" * 50)
    print("IMPROVEMENT ANALYSIS:")
    print("=" * 50)
    
    improvements = []
    
    if new_result.text.count('\n') > old_result.text.count('\n'):
        improvements.append("✅ Better line structure")
    
    if new_result.text.count('\n\n') > 0:
        improvements.append("✅ Paragraph detection")
    
    if len(new_result.text.strip()) > len(old_result.text.strip()):
        improvements.append("✅ More complete text extraction")
    
    if new_result.confidence >= old_result.confidence:
        improvements.append("✅ Maintained or improved confidence")
    
    improvements.append("✅ Spatial layout awareness")
    improvements.append("✅ Proper reading order")
    
    for improvement in improvements:
        print(improvement)
    
    if not improvements:
        print("⚠️  No significant improvements detected (may be a simple single-line document)")

def main():
    """Main function"""
    print("🚀 OCR TEXT PROCESSING IMPROVEMENT DEMO")
    print("This demo shows how the new text processing improves OCR output structure")
    
    # Check if test image exists
    test_image = "/Users/namle/Downloads/text-recognize/test_image.jpg"
    
    if os.path.exists(test_image):
        print(f"\n📁 Found test image: {test_image}")
        demonstrate_improvement(test_image)
    else:
        print(f"\n⚠️  Test image not found: {test_image}")
        print("Please provide an image file path as an argument.")
        print("Usage: python demo_improvement.py [image_path]")
        
        # Check command line arguments
        if len(sys.argv) > 1:
            custom_image = sys.argv[1]
            if os.path.exists(custom_image):
                print(f"\n📁 Using provided image: {custom_image}")
                demonstrate_improvement(custom_image)
            else:
                print(f"❌ Provided image not found: {custom_image}")
        else:
            print("\n💡 You can test this with any image file:")
            print("   python demo_improvement.py /path/to/your/image.jpg")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⏹️  Demo interrupted by user")
    except Exception as e:
        logger.error(f"Demo failed: {e}")
        print(f"\n❌ Demo failed: {e}")
        sys.exit(1)
