"""
Advanced text post-processing module for improving OCR output structure and readability.
Handles proper text ordering, line grouping, and layout preservation.
"""
import numpy as np
import logging
from typing import List, Tuple, Dict, Any
from dataclasses import dataclass
from enum import Enum

from models import WordDetail, TextLine, BoundingBox

logger = logging.getLogger(__name__)

class ReadingOrder(Enum):
    """Text reading order patterns"""
    LEFT_TO_RIGHT_TOP_TO_BOTTOM = "ltr_ttb"
    RIGHT_TO_LEFT_TOP_TO_BOTTOM = "rtl_ttb"
    TOP_TO_BOTTOM_LEFT_TO_RIGHT = "ttb_ltr"
    TOP_TO_BOTTOM_RIGHT_TO_LEFT = "ttb_rtl"

class LayoutType(Enum):
    """Document layout types"""
    SINGLE_COLUMN = "single_column"
    MULTI_COLUMN = "multi_column"
    TABLE = "table"
    MIXED = "mixed"

@dataclass
class TextBlock:
    """Represents a block of related text with spatial information"""
    text: str
    bbox: BoundingBox
    confidence: float
    word_details: List[WordDetail]
    text_lines: List[TextLine]
    is_paragraph: bool = False
    column_index: int = 0
    block_type: str = "text"

class AdvancedTextPostprocessor:
    """
    Advanced text post-processor that improves OCR output by:
    1. Analyzing spatial layout and reading order
    2. Grouping text into logical blocks and paragraphs
    3. Handling multi-column layouts and tables
    4. Preserving document structure
    """
    
    def __init__(self, reading_order: ReadingOrder = ReadingOrder.LEFT_TO_RIGHT_TOP_TO_BOTTOM):
        self.reading_order = reading_order
        self.line_height_threshold = 1.5  # For detecting line breaks
        self.paragraph_spacing_threshold = 2.0  # For detecting paragraph breaks
        self.column_gap_threshold = 0.1  # Minimum gap between columns (relative to page width)
        
    def process_ocr_result(self, word_details: List[WordDetail], text_lines: List[TextLine] = None) -> str:
        """
        Main processing function that takes OCR word details and returns properly structured text.
        
        Args:
            word_details: List of recognized words with bounding boxes
            text_lines: Optional list of text lines from OCR engine
            
        Returns:
            Properly structured text with preserved layout
        """
        if not word_details:
            return ""
            
        logger.debug(f"Processing {len(word_details)} word details")
        
        try:
            # Step 1: Analyze document layout
            layout_type = self._analyze_layout(word_details)
            logger.debug(f"Detected layout type: {layout_type}")
            
            # Step 2: Group words into logical text blocks
            if text_lines:
                text_blocks = self._group_by_text_lines(text_lines)
            else:
                text_blocks = self._group_words_into_blocks(word_details)
            
            logger.debug(f"Created {len(text_blocks)} text blocks")
            
            # Step 3: Sort blocks according to reading order
            sorted_blocks = self._sort_by_reading_order(text_blocks, layout_type)
            
            # Step 4: Apply layout-specific processing
            if layout_type == LayoutType.MULTI_COLUMN:
                structured_text = self._process_multi_column_layout(sorted_blocks)
            elif layout_type == LayoutType.TABLE:
                structured_text = self._process_table_layout(sorted_blocks)
            else:
                structured_text = self._process_single_column_layout(sorted_blocks)
            
            # Step 5: Clean up and format final text
            final_text = self._clean_and_format_text(structured_text)
            
            logger.debug(f"Final text length: {len(final_text)}")
            return final_text
            
        except Exception as e:
            logger.error(f"Error in text post-processing: {e}")
            # Fallback to simple concatenation
            return " ".join([word.text for word in word_details if word.text.strip()])
    
    def _analyze_layout(self, word_details: List[WordDetail]) -> LayoutType:
        """Analyze the document layout type based on word positions"""
        if len(word_details) < 3:
            return LayoutType.SINGLE_COLUMN
            
        # Get page dimensions
        all_boxes = [word.bbox for word in word_details]
        page_left = min(box.x for box in all_boxes)
        page_right = max(box.x + box.width for box in all_boxes)
        page_top = min(box.y for box in all_boxes)
        page_bottom = max(box.y + box.height for box in all_boxes)
        page_width = page_right - page_left
        page_height = page_bottom - page_top
        
        # Analyze column structure
        columns = self._detect_columns(word_details, page_width, page_left, page_right)
        
        if len(columns) > 1:
            # Check if it looks like a table (regular grid pattern)
            if self._looks_like_table(word_details):
                return LayoutType.TABLE
            else:
                return LayoutType.MULTI_COLUMN
        else:
            return LayoutType.SINGLE_COLUMN
    
    def _detect_columns(self, word_details: List[WordDetail], page_width: int, page_left: int, page_right: int) -> List[Tuple[int, int]]:
        """Detect column boundaries in the document"""
        # Group words by their X positions
        x_positions = []
        for word in word_details:
            x_positions.append(word.bbox.x)
            x_positions.append(word.bbox.x + word.bbox.width)
        
        x_positions.sort()
        
        # Find gaps that might indicate column boundaries
        gaps = []
        threshold = page_width * self.column_gap_threshold
        
        for i in range(1, len(x_positions)):
            gap = x_positions[i] - x_positions[i-1]
            if gap > threshold:
                gaps.append((x_positions[i-1], x_positions[i]))
        
        # Convert gaps to column boundaries
        columns = []
        if not gaps:
            columns = [(page_left, page_right)]
        else:
            # Add first column
            columns.append((page_left, gaps[0][0]))
            
            # Add middle columns
            for i in range(len(gaps) - 1):
                columns.append((gaps[i][1], gaps[i+1][0]))
            
            # Add last column
            columns.append((gaps[-1][1], page_right))
        
        return columns
    
    def _looks_like_table(self, word_details: List[WordDetail]) -> bool:
        """Check if the layout looks like a table structure"""
        # Simple heuristic: check for regular grid pattern
        # This is a basic implementation that can be enhanced
        
        y_positions = sorted(set(word.bbox.y for word in word_details))
        x_positions = sorted(set(word.bbox.x for word in word_details))
        
        # If we have multiple regular rows and columns, it might be a table
        return len(y_positions) >= 3 and len(x_positions) >= 3
    
    def _group_by_text_lines(self, text_lines: List[TextLine]) -> List[TextBlock]:
        """Group text lines into text blocks"""
        blocks = []
        
        for line in text_lines:
            # Convert TextLine to TextBlock
            word_detail = WordDetail(
                text=line.text,
                confidence=line.confidence,
                bbox=line.bbox,
                polygon=line.polygon
            )
            
            block = TextBlock(
                text=line.text,
                bbox=line.bbox,
                confidence=line.confidence,
                word_details=[word_detail],
                text_lines=[line]
            )
            blocks.append(block)
        
        return blocks
    
    def _group_words_into_blocks(self, word_details: List[WordDetail]) -> List[TextBlock]:
        """Group individual words into logical text blocks"""
        if not word_details:
            return []
        
        # Sort words by Y position first, then X position
        sorted_words = sorted(word_details, key=lambda w: (w.bbox.y, w.bbox.x))
        
        blocks = []
        current_block_words = [sorted_words[0]]
        
        for i in range(1, len(sorted_words)):
            current_word = sorted_words[i]
            prev_word = sorted_words[i-1]
            
            # Check if this word should be in the same block as the previous
            y_distance = abs(current_word.bbox.y - prev_word.bbox.y)
            avg_height = (current_word.bbox.height + prev_word.bbox.height) / 2
            
            # If words are on different lines (Y distance > line height threshold)
            if y_distance > avg_height * self.line_height_threshold:
                # Finish current block
                if current_block_words:
                    block = self._create_block_from_words(current_block_words)
                    blocks.append(block)
                
                # Start new block
                current_block_words = [current_word]
            else:
                # Add to current block
                current_block_words.append(current_word)
        
        # Add the last block
        if current_block_words:
            block = self._create_block_from_words(current_block_words)
            blocks.append(block)
        
        return blocks
    
    def _create_block_from_words(self, words: List[WordDetail]) -> TextBlock:
        """Create a TextBlock from a list of words"""
        if not words:
            return None
        
        # Combine text
        text = " ".join(word.text for word in words)
        
        # Calculate combined bounding box
        min_x = min(word.bbox.x for word in words)
        min_y = min(word.bbox.y for word in words)
        max_x = max(word.bbox.x + word.bbox.width for word in words)
        max_y = max(word.bbox.y + word.bbox.height for word in words)
        
        combined_bbox = BoundingBox(
            x=min_x,
            y=min_y,
            width=max_x - min_x,
            height=max_y - min_y
        )
        
        # Calculate average confidence
        avg_confidence = sum(word.confidence for word in words) / len(words)
        
        return TextBlock(
            text=text,
            bbox=combined_bbox,
            confidence=avg_confidence,
            word_details=words,
            text_lines=[]
        )
    
    def _sort_by_reading_order(self, blocks: List[TextBlock], layout_type: LayoutType) -> List[TextBlock]:
        """Sort text blocks according to reading order"""
        if not blocks:
            return blocks
        
        if layout_type == LayoutType.MULTI_COLUMN:
            return self._sort_multi_column_blocks(blocks)
        elif layout_type == LayoutType.TABLE:
            return self._sort_table_blocks(blocks)
        else:
            return self._sort_single_column_blocks(blocks)
    
    def _sort_single_column_blocks(self, blocks: List[TextBlock]) -> List[TextBlock]:
        """Sort blocks for single column layout"""
        if self.reading_order == ReadingOrder.LEFT_TO_RIGHT_TOP_TO_BOTTOM:
            return sorted(blocks, key=lambda b: (b.bbox.y, b.bbox.x))
        elif self.reading_order == ReadingOrder.RIGHT_TO_LEFT_TOP_TO_BOTTOM:
            return sorted(blocks, key=lambda b: (b.bbox.y, -b.bbox.x))
        elif self.reading_order == ReadingOrder.TOP_TO_BOTTOM_LEFT_TO_RIGHT:
            return sorted(blocks, key=lambda b: (b.bbox.x, b.bbox.y))
        else:  # TOP_TO_BOTTOM_RIGHT_TO_LEFT
            return sorted(blocks, key=lambda b: (-b.bbox.x, b.bbox.y))
    
    def _sort_multi_column_blocks(self, blocks: List[TextBlock]) -> List[TextBlock]:
        """Sort blocks for multi-column layout"""
        # Assign column indices to blocks
        columns = self._detect_columns([block.word_details[0] for block in blocks if block.word_details], 
                                     0, 0, 1000)  # Simplified for now
        
        for block in blocks:
            block.column_index = self._get_column_index(block, columns)
        
        # Sort by column, then by Y position within each column
        return sorted(blocks, key=lambda b: (b.column_index, b.bbox.y))
    
    def _sort_table_blocks(self, blocks: List[TextBlock]) -> List[TextBlock]:
        """Sort blocks for table layout"""
        # For tables, sort by row (Y position) first, then by column (X position)
        return sorted(blocks, key=lambda b: (b.bbox.y, b.bbox.x))
    
    def _get_column_index(self, block: TextBlock, columns: List[Tuple[int, int]]) -> int:
        """Determine which column a block belongs to"""
        block_center_x = block.bbox.x + block.bbox.width / 2
        
        for i, (col_start, col_end) in enumerate(columns):
            if col_start <= block_center_x <= col_end:
                return i
        
        return 0  # Default to first column
    
    def _process_single_column_layout(self, blocks: List[TextBlock]) -> str:
        """Process single column layout"""
        text_parts = []
        
        for i, block in enumerate(blocks):
            text_parts.append(block.text)
            
            # Add line breaks between blocks based on spacing
            if i < len(blocks) - 1:
                next_block = blocks[i + 1]
                vertical_gap = next_block.bbox.y - (block.bbox.y + block.bbox.height)
                avg_height = (block.bbox.height + next_block.bbox.height) / 2
                
                # Add paragraph break for large gaps
                if vertical_gap > avg_height * self.paragraph_spacing_threshold:
                    text_parts.append("\n\n")
                else:
                    text_parts.append("\n")
        
        return "".join(text_parts)
    
    def _process_multi_column_layout(self, blocks: List[TextBlock]) -> str:
        """Process multi-column layout"""
        # Group blocks by column
        columns_dict = {}
        for block in blocks:
            col_idx = block.column_index
            if col_idx not in columns_dict:
                columns_dict[col_idx] = []
            columns_dict[col_idx].append(block)
        
        # Process each column separately, then combine
        column_texts = []
        for col_idx in sorted(columns_dict.keys()):
            col_blocks = sorted(columns_dict[col_idx], key=lambda b: b.bbox.y)
            col_text = self._process_single_column_layout(col_blocks)
            column_texts.append(col_text)
        
        # Combine columns with appropriate separators
        return "\n\n--- Column Break ---\n\n".join(column_texts)
    
    def _process_table_layout(self, blocks: List[TextBlock]) -> str:
        """Process table layout"""
        # Group blocks by rows (similar Y positions)
        rows = []
        current_row = []
        
        sorted_blocks = sorted(blocks, key=lambda b: (b.bbox.y, b.bbox.x))
        
        for i, block in enumerate(sorted_blocks):
            if not current_row:
                current_row = [block]
            else:
                # Check if this block is on the same row as the previous
                prev_block = current_row[-1]
                y_distance = abs(block.bbox.y - prev_block.bbox.y)
                avg_height = (block.bbox.height + prev_block.bbox.height) / 2
                
                if y_distance < avg_height * 0.5:  # Same row
                    current_row.append(block)
                else:  # New row
                    rows.append(current_row)
                    current_row = [block]
        
        if current_row:
            rows.append(current_row)
        
        # Format as table
        table_text = []
        for row in rows:
            row_text = " | ".join(block.text for block in row)
            table_text.append(row_text)
        
        return "\n".join(table_text)
    
    def _clean_and_format_text(self, text: str) -> str:
        """Clean and format the final text"""
        # Remove excessive whitespace
        lines = text.split('\n')
        cleaned_lines = []
        
        for line in lines:
            # Clean each line
            cleaned_line = ' '.join(line.split())  # Remove extra spaces
            cleaned_lines.append(cleaned_line)
        
        # Join lines and clean up multiple consecutive newlines
        result = '\n'.join(cleaned_lines)
        
        # Replace multiple consecutive newlines with double newlines (paragraph breaks)
        import re
        result = re.sub(r'\n{3,}', '\n\n', result)
        
        return result.strip()

# Factory function for easy usage
def create_text_postprocessor(reading_order: str = "ltr_ttb") -> AdvancedTextPostprocessor:
    """Create a text postprocessor with specified reading order"""
    order_map = {
        "ltr_ttb": ReadingOrder.LEFT_TO_RIGHT_TOP_TO_BOTTOM,
        "rtl_ttb": ReadingOrder.RIGHT_TO_LEFT_TOP_TO_BOTTOM,
        "ttb_ltr": ReadingOrder.TOP_TO_BOTTOM_LEFT_TO_RIGHT,
        "ttb_rtl": ReadingOrder.TOP_TO_BOTTOM_RIGHT_TO_LEFT,
    }
    
    order = order_map.get(reading_order, ReadingOrder.LEFT_TO_RIGHT_TOP_TO_BOTTOM)
    return AdvancedTextPostprocessor(reading_order=order)

def improve_text_structure(word_details: List[WordDetail], text_lines: List[TextLine] = None, 
                          reading_order: str = "ltr_ttb") -> str:
    """
    Convenience function to improve text structure from OCR results.
    
    Args:
        word_details: List of word details from OCR
        text_lines: Optional list of text lines from OCR
        reading_order: Reading order pattern ("ltr_ttb", "rtl_ttb", "ttb_ltr", "ttb_rtl")
        
    Returns:
        Improved structured text
    """
    processor = create_text_postprocessor(reading_order)
    return processor.process_ocr_result(word_details, text_lines)
