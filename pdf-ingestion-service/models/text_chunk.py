from typing import Optional
from dataclasses import dataclass
import hashlib


@dataclass
class ParsedPage:
    doc_id: str
    page_number: int
    page_label: Optional[str]
    text: str


@dataclass
class RawChunk:
    doc_id: str
    page_number: int
    chunk_index: int
    start_char: int
    end_char: int
    text: str


@dataclass
class TextChunk:
    doc_id: str
    chunk_id: str
    page_number: int
    page_label: Optional[str]
    chunk_index: int
    start_char: int
    end_char: int
    text: str
    doc_type: str
    domain: str
    source: str
    source_system: str
    
    @staticmethod
    def generate_chunk_id(doc_id: str, page_number: int, chunk_index: int) -> str:
        data = f"{doc_id}|{page_number}|{chunk_index}"
        hash_hex = hashlib.sha256(data.encode()).hexdigest()
        return f"{hash_hex[:8]}-{hash_hex[8:12]}-{hash_hex[12:16]}-{hash_hex[16:20]}-{hash_hex[20:32]}"
