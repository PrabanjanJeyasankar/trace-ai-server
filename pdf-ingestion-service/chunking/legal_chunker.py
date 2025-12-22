import re
from models import ParsedPage, RawChunk


MIN_CHUNK_SIZE = 600
MAX_CHUNK_SIZE = 800
OVERLAP_PARAGRAPHS = 1


class LegalChunker:
    def chunk_pages(self, pages: list[ParsedPage]) -> list[RawChunk]:
        all_chunks = []
        
        for page in pages:
            page_chunks = self._chunk_single_page(page)
            all_chunks.extend(page_chunks)
        
        return all_chunks
    
    def _chunk_single_page(self, page: ParsedPage) -> list[RawChunk]:
        text = page.text
        paragraphs = self._split_into_paragraphs(text)
        
        chunks = []
        chunk_index = 0
        current_chunk_text = ""
        current_start_char = 0
        overlap_text = ""
        
        for para in paragraphs:
            candidate_text = current_chunk_text + ("\n\n" if current_chunk_text else "") + para
            
            if len(candidate_text) <= MAX_CHUNK_SIZE:
                current_chunk_text = candidate_text
            else:
                if current_chunk_text:
                    end_char = current_start_char + len(current_chunk_text)
                    chunks.append(RawChunk(
                        doc_id=page.doc_id,
                        page_number=page.page_number,
                        chunk_index=chunk_index,
                        start_char=current_start_char,
                        end_char=end_char,
                        text=current_chunk_text
                    ))
                    chunk_index += 1
                    
                    overlap_text = current_chunk_text.split("\n\n")[-OVERLAP_PARAGRAPHS:][0] if "\n\n" in current_chunk_text else ""
                    current_start_char = end_char - len(overlap_text)
                    current_chunk_text = overlap_text + "\n\n" + para if overlap_text else para
                else:
                    sentences = self._split_into_sentences(para)
                    for sent in sentences:
                        if len(current_chunk_text + sent) <= MAX_CHUNK_SIZE:
                            current_chunk_text += sent
                        else:
                            if current_chunk_text:
                                end_char = current_start_char + len(current_chunk_text)
                                chunks.append(RawChunk(
                                    doc_id=page.doc_id,
                                    page_number=page.page_number,
                                    chunk_index=chunk_index,
                                    start_char=current_start_char,
                                    end_char=end_char,
                                    text=current_chunk_text
                                ))
                                chunk_index += 1
                                current_start_char = end_char
                            current_chunk_text = sent
        
        if current_chunk_text and len(current_chunk_text.strip()) >= MIN_CHUNK_SIZE:
            end_char = current_start_char + len(current_chunk_text)
            chunks.append(RawChunk(
                doc_id=page.doc_id,
                page_number=page.page_number,
                chunk_index=chunk_index,
                start_char=current_start_char,
                end_char=end_char,
                text=current_chunk_text
            ))
        
        return chunks
    
    def _split_into_paragraphs(self, text: str) -> list[str]:
        return [p.strip() for p in re.split(r'\n\s*\n', text) if p.strip()]
    
    def _split_into_sentences(self, text: str) -> list[str]:
        pattern = r'(?<=[.!?])\s+'
        sentences = re.split(pattern, text)
        return [s.strip() + " " for s in sentences if s.strip()]
