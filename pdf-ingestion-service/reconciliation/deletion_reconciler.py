from typing import Optional
from state.document_state import DocumentStateStore
from vectorstore.qdrant_client import QdrantVectorStore


class DeletionReconciler:
    def __init__(self, state_store: DocumentStateStore, vector_store: QdrantVectorStore):
        self.state_store = state_store
        self.vector_store = vector_store
    
    def reconcile_deletions(self, current_doc_ids: set[str]) -> tuple[int, Optional[str]]:
        try:
            known_doc_ids = self.state_store.get_all_doc_ids()
            
            deleted_doc_ids = known_doc_ids - current_doc_ids
            
            if not deleted_doc_ids:
                return (0, None)
            
            deleted_count = self.vector_store.delete_by_doc_ids(list(deleted_doc_ids))
            
            for doc_id in deleted_doc_ids:
                self.state_store.delete(doc_id)
            
            return (deleted_count, None)
        
        except Exception as e:
            return (0, f"Reconciliation failed: {str(e)}")
