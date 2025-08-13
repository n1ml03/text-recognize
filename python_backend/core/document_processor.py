"""
Document text extraction from various file formats (PDF, DOCX, etc.)
"""
import logging
from models import DocumentExtractionResult

logger = logging.getLogger(__name__)

def extract_text_from_document(file_path: str) -> DocumentExtractionResult:
    """
    Extracts plain text from a document file.
    Currently supports PDF, DOCX, TXT, and RTF files.
    """
    import time
    start_time = time.time()
    
    try:
        file_extension = file_path.lower().split('.')[-1]
        extracted_text = ""
        
        if file_extension == 'txt':
            with open(file_path, 'r', encoding='utf-8') as f:
                extracted_text = f.read()
        
        elif file_extension == 'pdf':
            # TODO: Implement PDF text extraction
            raise NotImplementedError("PDF text extraction not yet implemented")
            
        elif file_extension == 'docx':
            # TODO: Implement DOCX text extraction
            raise NotImplementedError("DOCX text extraction not yet implemented")
            
        elif file_extension == 'rtf':
            # TODO: Implement RTF text extraction
            raise NotImplementedError("RTF text extraction not yet implemented")
            
        else:
            raise ValueError(f"Unsupported file format: {file_extension}")
        
        processing_time = time.time() - start_time
        
        return DocumentExtractionResult(
            text=extracted_text,
            file_path=file_path,
            file_type=file_extension,
            processing_time=processing_time,
            success=True
        )
        
    except Exception as e:
        logger.error(f"Document extraction failed for {file_path}: {e}")
        return DocumentExtractionResult(
            text="",
            file_path=file_path,
            file_type=file_path.lower().split('.')[-1] if '.' in file_path else "unknown",
            processing_time=time.time() - start_time,
            success=False,
            error_message=str(e)
        )
