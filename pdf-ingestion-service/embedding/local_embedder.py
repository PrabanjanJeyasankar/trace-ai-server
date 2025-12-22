from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
from sentence_transformers import SentenceTransformer


MODEL_NAME = "BAAI/bge-small-en-v1.5"
EMBEDDING_DIMENSION = 384
MAX_CONCURRENT_EMBEDDINGS = 3


class LocalEmbedder:
    def __init__(self):
        print(f"Loading embedding model: {MODEL_NAME}...")
        self.model = SentenceTransformer(MODEL_NAME)
        print(f"Model loaded successfully. Vector dimension: {EMBEDDING_DIMENSION}")
    
    def _embed_single_text(self, text: str) -> Optional[list[float]]:
        if not text or not isinstance(text, str):
            return None
        
        try:
            embedding = self.model.encode(text, convert_to_numpy=True)
            vector = embedding.tolist()
            
            if len(vector) != EMBEDDING_DIMENSION:
                raise ValueError(f"Vector dimension mismatch: got {len(vector)}, expected {EMBEDDING_DIMENSION}")
            
            return vector
        
        except Exception as e:
            print(f"Embedding failed: {str(e)}")
            return None
    
    def embed_batch(self, texts: list[str]) -> list[tuple[int, Optional[list[float]]]]:
        if not texts:
            return []
        
        results = []
        
        with ThreadPoolExecutor(max_workers=MAX_CONCURRENT_EMBEDDINGS) as executor:
            futures = {
                executor.submit(self._embed_single_text, text): idx 
                for idx, text in enumerate(texts)
            }
            
            for future in as_completed(futures):
                idx = futures[future]
                vector = future.result()
                results.append((idx, vector))
        
        results.sort(key=lambda x: x[0])
        return results
