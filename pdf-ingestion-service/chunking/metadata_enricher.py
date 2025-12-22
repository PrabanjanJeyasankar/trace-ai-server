from models import RawChunk, TextChunk, ParsedPage


class MetadataEnricher:
    def enrich(
        self,
        chunks: list[RawChunk],
        pages: list[ParsedPage],
        domain: str,
        doc_type: str = "unknown"
    ) -> list[TextChunk]:
        page_labels_map = {p.page_number: p.page_label for p in pages}
        
        text_chunks = []
        for chunk in chunks:
            chunk_id = TextChunk.generate_chunk_id(
                chunk.doc_id,
                chunk.page_number,
                chunk.chunk_index
            )
            
            text_chunk = TextChunk(
                doc_id=chunk.doc_id,
                chunk_id=chunk_id,
                page_number=chunk.page_number,
                page_label=page_labels_map.get(chunk.page_number),
                chunk_index=chunk.chunk_index,
                start_char=chunk.start_char,
                end_char=chunk.end_char,
                text=chunk.text,
                doc_type=doc_type,
                domain=domain,
                source="pdf",
                source_system="r2"
            )
            text_chunks.append(text_chunk)
        
        return text_chunks
