from typing import Optional
from dataclasses import dataclass
from datetime import datetime
from pymongo import MongoClient
import os


@dataclass
class DocumentState:
    doc_id: str
    etag: str
    checksum: str
    last_ingested_at: str
    upsert_completed: bool = False


class DocumentStateStore:
    def __init__(self, mongo_url: str = None):
        self.mongo_url = self._normalize_mongo_url(
            mongo_url or os.getenv("MONGO_URL", "")
        )
        self.client = MongoClient(self.mongo_url)
        self.db = self._get_database()
        self.collection = self.db["ingestion_state"]
        self._init_db()

    @staticmethod
    def _normalize_mongo_url(mongo_url: str) -> str:
        """Guard against empty hosts (e.g., trailing commas) in env."""
        fallback = "mongodb://mongo:27017"
        if not mongo_url:
            return fallback

        cleaned = mongo_url.strip()
        if not cleaned:
            return fallback

        if cleaned.startswith("mongodb://"):
            prefix = "mongodb://"
            rest = cleaned[len(prefix):]
            if "@" in rest:
                auth, hosts = rest.split("@", 1)
                hosts = ",".join([h for h in hosts.split(",") if h.strip()])
                cleaned = f"{prefix}{auth}@{hosts}"
            else:
                hosts = ",".join([h for h in rest.split(",") if h.strip()])
                cleaned = f"{prefix}{hosts}"
        else:
            parts = cleaned.split(",", 1)
            if len(parts) == 2:
                hosts, tail = parts
                hosts = ",".join([h for h in hosts.split(",") if h.strip()])
                cleaned = f"{hosts},{tail}"

        if cleaned.endswith("mongodb://") or cleaned.endswith("@"):
            return fallback
        if "mongodb://" in cleaned and cleaned.split("mongodb://", 1)[1] == "":
            return fallback
        return cleaned if cleaned != "mongodb://" else fallback

    def _get_database(self):
        try:
            default_db = self.client.get_default_database()
            if default_db is not None:
                return default_db
        except Exception:
            pass

        db_name = os.getenv("MONGO_DB_NAME", "pdf_ingestion_db")
        return self.client[db_name]
    
    def _init_db(self):
        """Create index on doc_id for fast lookups."""
        self.collection.create_index("doc_id", unique=True)
    
    def get(self, doc_id: str) -> Optional[DocumentState]:
        doc = self.collection.find_one({"doc_id": doc_id})
        
        if doc:
            return DocumentState(
                doc_id=doc["doc_id"],
                etag=doc["etag"],
                checksum=doc["checksum"],
                last_ingested_at=doc["last_ingested_at"],
                upsert_completed=doc.get("upsert_completed", False)
            )
        return None
    
    def upsert(self, doc_id: str, etag: str, checksum: str, upsert_completed: bool = False):
        now = datetime.utcnow().isoformat()
        self.collection.update_one(
            {"doc_id": doc_id},
            {
                "$set": {
                    "doc_id": doc_id,
                    "etag": etag,
                    "checksum": checksum,
                    "last_ingested_at": now,
                    "upsert_completed": upsert_completed
                }
            },
            upsert=True
        )
    
    def update_etag_only(self, doc_id: str, etag: str):
        self.collection.update_one(
            {"doc_id": doc_id},
            {"$set": {"etag": etag}}
        )
    
    def get_all_doc_ids(self) -> set[str]:
        docs = self.collection.find({}, {"doc_id": 1})
        return {doc["doc_id"] for doc in docs}
    
    def mark_upsert_complete(self, doc_id: str):
        """Mark that a document's chunks have been successfully upserted to Qdrant."""
        self.collection.update_one(
            {"doc_id": doc_id},
            {"$set": {"upsert_completed": True}}
        )
    
    def delete(self, doc_id: str):
        self.collection.delete_one({"doc_id": doc_id})
