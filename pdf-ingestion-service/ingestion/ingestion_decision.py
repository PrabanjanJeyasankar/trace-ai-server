from enum import Enum
from typing import Optional
from r2.client import PdfDocument, R2Client
from state import DocumentStateStore
from utils import compute_file_checksum


class IngestionDecision(str, Enum):
    INGEST = "INGEST"
    SKIP = "SKIP"
    REINGEST = "REINGEST"


class IngestionDecisionEngine:
    def __init__(self, r2_client: R2Client, state_store: DocumentStateStore):
        self.r2_client = r2_client
        self.state_store = state_store
    
    def decide(self, doc: PdfDocument) -> tuple[IngestionDecision, Optional[str]]:
        previous_state = self.state_store.get(doc.doc_id)
        
        if not previous_state:
            checksum = self._compute_checksum(doc.object_key)
            return (IngestionDecision.INGEST, checksum)
        
        if previous_state.etag == doc.etag:
            return (IngestionDecision.SKIP, None)
        
        checksum = self._compute_checksum(doc.object_key)
        
        if previous_state.checksum == checksum:
            self.state_store.update_etag_only(doc.doc_id, doc.etag)
            return (IngestionDecision.SKIP, None)
        
        return (IngestionDecision.REINGEST, checksum)
    
    def _compute_checksum(self, object_key: str) -> str:
        file_bytes = self.r2_client.download_pdf(object_key)
        return compute_file_checksum(file_bytes)
    
    def mark_ingested(self, doc: PdfDocument, checksum: str):
        self.state_store.upsert(doc.doc_id, doc.etag, checksum)
