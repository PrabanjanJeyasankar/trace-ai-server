import os
import time
from typing import Optional
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue


COLLECTION_NAME = "legal_documents"
VECTOR_DIMENSION = 384


class QdrantVectorStore:
    def __init__(self, url: Optional[str] = None, batch_size: int = 100, max_retries: int = 3):
        self.url = url or os.getenv("QDRANT_URL", "http://localhost:6333")
        self.client = QdrantClient(url=self.url, timeout=60)
        self.batch_size = batch_size
        self.max_retries = max_retries
        self._ensure_collection()
    
    def _ensure_collection(self):
        collections = self.client.get_collections().collections
        collection_names = [c.name for c in collections]
        
        if COLLECTION_NAME not in collection_names:
            self.client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(
                    size=VECTOR_DIMENSION,
                    distance=Distance.COSINE
                )
            )
    
    def _upsert_batch_with_retry(self, points: list[PointStruct], batch_num: int, total_batches: int) -> tuple[bool, Optional[str]]:
        """Upsert a single batch with exponential backoff retry logic."""
        for attempt in range(self.max_retries):
            try:
                self.client.upsert(
                    collection_name=COLLECTION_NAME,
                    points=points,
                    wait=True
                )
                print(f"    Batch {batch_num}/{total_batches}: ✓ {len(points)} points upserted")
                return (True, None)
            except Exception as e:
                error_msg = str(e)
                if attempt < self.max_retries - 1:
                    wait_time = 2 ** attempt
                    print(f"    Batch {batch_num}/{total_batches} failed (attempt {attempt + 1}/{self.max_retries}): {error_msg}. Retrying in {wait_time}s...")
                    time.sleep(wait_time)
                else:
                    print(f"    Batch {batch_num}/{total_batches}: ✗ FAILED after {self.max_retries} attempts - {error_msg}")
                    return (False, error_msg)
        
        return (False, "Max retries exceeded")
    
    def upsert_chunks(self, chunk_data: list[dict]) -> tuple[bool, str]:
        """Upsert chunks in batches with retry logic. Returns (success, error_message)."""
        if not chunk_data:
            return (True, "")
        
        # Validate and build points
        points = []
        validation_failures = 0
        
        for item in chunk_data:
            chunk_id = item.get("chunk_id")
            vector = item.get("vector")
            payload = item.get("payload")
            
            if not chunk_id or not vector or not payload:
                validation_failures += 1
                continue
            
            if not isinstance(vector, list) or len(vector) != VECTOR_DIMENSION:
                validation_failures += 1
                continue
            
            points.append(
                PointStruct(
                    id=chunk_id,
                    vector=vector,
                    payload=payload
                )
            )
        
        if validation_failures > 0:
            print(f"  Validation failures: {validation_failures} chunks skipped")
        
        if not points:
            return (False, f"All {validation_failures} chunks failed validation")
        
        # Batch upsert with all-or-nothing semantics
        total_points = len(points)
        num_batches = (total_points + self.batch_size - 1) // self.batch_size
        
        print(f"  Upserting {total_points} points in {num_batches} batch(es)...")
        
        for i in range(0, total_points, self.batch_size):
            batch = points[i:i + self.batch_size]
            batch_num = (i // self.batch_size) + 1
            
            success, error = self._upsert_batch_with_retry(batch, batch_num, num_batches)
            
            if not success:
                return (False, f"Batch {batch_num}/{num_batches} failed: {error}")
        
        return (True, "")
    
    def delete_by_doc_id(self, doc_id: str) -> tuple[bool, Optional[str]]:
        """Delete all chunks for a single document. Returns (success, error_message)."""
        try:
            self.client.delete(
                collection_name=COLLECTION_NAME,
                points_selector=Filter(
                    must=[
                        FieldCondition(
                            key="doc_id",
                            match=MatchValue(value=doc_id)
                        )
                    ]
                ),
                wait=True
            )
            return (True, None)
        except Exception as e:
            return (False, str(e))
    
    def delete_by_doc_ids(self, doc_ids: list[str]) -> int:
        if not doc_ids:
            return 0
        
        deleted_count = 0
        
        for doc_id in doc_ids:
            result = self.client.delete(
                collection_name=COLLECTION_NAME,
                points_selector=Filter(
                    must=[
                        FieldCondition(
                            key="doc_id",
                            match=MatchValue(value=doc_id)
                        )
                    ]
                )
            )
            
            if result and hasattr(result, "operation_id"):
                deleted_count += 1
        
        return deleted_count
