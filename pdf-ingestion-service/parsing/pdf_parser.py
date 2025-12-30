from typing import Optional
from enum import Enum
import io
from pypdf import PdfReader
from models import ParsedPage


MIN_TEXT_THRESHOLD = 100


class ParseFailureReason(str, Enum):
    FAILED_PARSE_TEXT_EMPTY = "FAILED_PARSE_TEXT_EMPTY"
    FAILED_PARSE_ERROR = "FAILED_PARSE_ERROR"


class PdfParser:
    def parse(self, doc_id: str, file_bytes: bytes) -> tuple[Optional[list[ParsedPage]], Optional[ParseFailureReason]]:
        try:
            pdf_reader = PdfReader(io.BytesIO(file_bytes))
            pages = []
            total_text_length = 0
            
            for page_num, page in enumerate(pdf_reader.pages, start=1):
                text = page.extract_text()
                
                if not text or text.strip() == "":
                    continue
                
                total_text_length += len(text.strip())
                
                page_label = None
                if hasattr(page, "page_number") and page.page_number is not None:
                    page_label = str(page.page_number)
                
                parsed_page = ParsedPage(
                    doc_id=doc_id,
                    page_number=page_num,
                    page_label=page_label,
                    text=text
                )
                pages.append(parsed_page)
            
            if total_text_length < MIN_TEXT_THRESHOLD:
                return (None, ParseFailureReason.FAILED_PARSE_TEXT_EMPTY)
            
            return (pages, None)
        
        except Exception as e:
            return (None, ParseFailureReason.FAILED_PARSE_ERROR)
