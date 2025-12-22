import os
from typing import Optional
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue


COLLECTION_NAME = "legal_documents"
VECTOR_DIMENSION = 384


class QdrantVectorStore:
    def __init__(self, url: Optional[str] = None):
        self.url = url or os.getenv("QDRANT_URL", "http://localhost:6333")
        self.client = QdrantClient(url=self.url)
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
    
    def upsert_chunks(self, chunk_data: list[dict]) -> tuple[int, int]:
        if not chunk_data:
            return (0, 0)
        
        points = []
        success_count = 0
        failure_count = 0
        
        for item in chunk_data:
            chunk_id = item.get("chunk_id")
            vector = item.get("vector")
            payload = item.get("payload")
            
            if not chunk_id or not vector or not payload:
                failure_count += 1
                continue
            
            if not isinstance(vector, list) or len(vector) != VECTOR_DIMENSION:
                failure_count += 1
                continue
            
            points.append(
                PointStruct(
                    id=chunk_id,
                    vector=vector,
                    payload=payload
                )
            )
            success_count += 1
        
        if points:
            self.client.upsert(
                collection_name=COLLECTION_NAME,
                points=points
            )
        
        return (success_count, failure_count)
    
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
