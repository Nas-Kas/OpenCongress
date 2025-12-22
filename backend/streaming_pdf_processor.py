"""
Streaming PDF processor for large legislative documents.
Handles 3,000+ page PDFs without memory issues.
"""
import fitz as PyMuPDF  # PyMuPDF
from typing import Iterator, Dict, List, Tuple
import re


class StreamingPDFProcessor:
    """Process large PDFs page-by-page without loading entire document into memory."""
    
    def __init__(self, chunk_chars: int = 3500, overlap_chars: int = 600, bucket_size: int = 50):
        """
        Args:
            chunk_chars: Target chunk size in characters
            overlap_chars: Overlap between chunks for context preservation
            bucket_size: Number of pages per bucket for hierarchical summarization
        """
        self.chunk_chars = chunk_chars
        self.overlap_chars = overlap_chars
        self.bucket_size = bucket_size
    
    def iter_pdf_pages(self, pdf_path: str) -> Iterator[Tuple[int, str]]:
        """
        Iterate through PDF pages one at a time.
        
        Yields:
            (page_num, text): Page number (1-indexed) and extracted text
        """
        doc = PyMuPDF.open(pdf_path)
        try:
            for page_num in range(len(doc)):
                page = doc[page_num]
                text = page.get_text()
                # Clean up text
                text = re.sub(r'\s+', ' ', text).strip()
                yield (page_num + 1, text)  # 1-indexed page numbers
        finally:
            doc.close()
    
    def chunk_page_stream(
        self, 
        page_stream: Iterator[Tuple[int, str]]
    ) -> Iterator[Dict]:
        """
        Convert page stream into overlapping chunks with metadata.
        
        Yields:
            {
                'text': str,
                'page_start': int,
                'page_end': int,
                'bucket_id': int,
                'char_start': int,  # Character position in original document
                'char_end': int
            }
        """
        buffer = ""
        buffer_page_start = None
        buffer_page_end = None
        char_position = 0
        chunk_index = 0
        
        for page_num, page_text in page_stream:
            if not buffer:
                buffer_page_start = page_num
            
            buffer += " " + page_text
            buffer_page_end = page_num
            
            # Yield chunks when buffer exceeds target size
            while len(buffer) >= self.chunk_chars:
                # Find a good break point (sentence boundary)
                break_point = self._find_break_point(buffer, self.chunk_chars)
                
                chunk_text = buffer[:break_point].strip()
                
                if chunk_text:
                    bucket_id = (buffer_page_start - 1) // self.bucket_size
                    
                    yield {
                        'text': chunk_text,
                        'page_start': buffer_page_start,
                        'page_end': buffer_page_end,
                        'bucket_id': bucket_id,
                        'char_start': char_position,
                        'char_end': char_position + len(chunk_text),
                        'chunk_index': chunk_index
                    }
                    chunk_index += 1
                
                # Keep overlap for context
                overlap_start = max(0, break_point - self.overlap_chars)
                buffer = buffer[overlap_start:]
                char_position += break_point - overlap_start
                
                # Update page tracking for remaining buffer
                # (This is approximate - we don't track exact page boundaries in overlap)
                if len(buffer) < self.overlap_chars:
                    buffer_page_start = buffer_page_end
        
        # Yield final chunk if buffer has content
        if buffer.strip():
            bucket_id = (buffer_page_start - 1) // self.bucket_size
            yield {
                'text': buffer.strip(),
                'page_start': buffer_page_start,
                'page_end': buffer_page_end,
                'bucket_id': bucket_id,
                'char_start': char_position,
                'char_end': char_position + len(buffer),
                'chunk_index': chunk_index
            }
    
    def _find_break_point(self, text: str, target: int) -> int:
        """
        Find a good break point near the target position.
        Prefers sentence boundaries, then word boundaries.
        """
        if len(text) <= target:
            return len(text)
        
        # Look for sentence end within reasonable range
        search_start = max(0, target - 200)
        search_end = min(len(text), target + 200)
        search_region = text[search_start:search_end]
        
        # Try to find sentence boundary (. ! ?)
        sentence_ends = [
            m.end() for m in re.finditer(r'[.!?]\s+', search_region)
        ]
        
        if sentence_ends:
            # Find closest to target
            closest = min(sentence_ends, key=lambda x: abs((search_start + x) - target))
            return search_start + closest
        
        # Fall back to word boundary
        if target < len(text):
            # Find next space after target
            space_pos = text.find(' ', target)
            if space_pos != -1:
                return space_pos
        
        return target
    
    def get_total_pages(self, pdf_path: str) -> int:
        """Get total page count without loading entire document."""
        doc = PyMuPDF.open(pdf_path)
        try:
            return len(doc)
        finally:
            doc.close()
    
    def process_pdf_streaming(self, pdf_path: str) -> Iterator[Dict]:
        """
        Main entry point: stream PDF pages and yield chunks with metadata.
        
        Args:
            pdf_path: Path to PDF file
            
        Yields:
            Chunk dictionaries with text and metadata
        """
        page_stream = self.iter_pdf_pages(pdf_path)
        yield from self.chunk_page_stream(page_stream)


# Example usage
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python streaming_pdf_processor.py <pdf_path>")
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    processor = StreamingPDFProcessor()
    
    print(f"Processing: {pdf_path}")
    print(f"Total pages: {processor.get_total_pages(pdf_path)}")
    print("\nFirst 5 chunks:")
    
    for i, chunk in enumerate(processor.process_pdf_streaming(pdf_path)):
        if i >= 5:
            break
        print(f"\nChunk {i}:")
        print(f"  Pages: {chunk['page_start']}-{chunk['page_end']}")
        print(f"  Bucket: {chunk['bucket_id']}")
        print(f"  Length: {len(chunk['text'])} chars")
        print(f"  Preview: {chunk['text'][:100]}...")
