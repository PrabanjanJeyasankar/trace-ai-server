import sqlite3
from typing import Optional
from dataclasses import dataclass
from datetime import datetime
import os


@dataclass
class DocumentState:
    doc_id: str
    etag: str
    checksum: str
    last_ingested_at: str
    upsert_completed: bool = False


class DocumentStateStore:
    def __init__(self, db_path: str = "ingestion_state.db"):
        self.db_path = db_path
        self._init_db()
    
    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS document_state (
                doc_id TEXT PRIMARY KEY,
                etag TEXT NOT NULL,
                checksum TEXT NOT NULL,
                last_ingested_at TEXT NOT NULL,
                upsert_completed INTEGER DEFAULT 0
            )
        """)
        
        # Migration: add upsert_completed column if it doesn't exist
        cursor.execute("PRAGMA table_info(document_state)")
        columns = [row[1] for row in cursor.fetchall()]
        if "upsert_completed" not in columns:
            cursor.execute("ALTER TABLE document_state ADD COLUMN upsert_completed INTEGER DEFAULT 0")
        
        conn.commit()
        conn.close()
    
    def get(self, doc_id: str) -> Optional[DocumentState]:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT doc_id, etag, checksum, last_ingested_at, upsert_completed FROM document_state WHERE doc_id = ?",
            (doc_id,)
        )
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return DocumentState(
                doc_id=row[0],
                etag=row[1],
                checksum=row[2],
                last_ingested_at=row[3],
                upsert_completed=bool(row[4]) if len(row) > 4 else False
            )
        return None
    
    def upsert(self, doc_id: str, etag: str, checksum: str, upsert_completed: bool = False):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        now = datetime.utcnow().isoformat()
        cursor.execute("""
            INSERT INTO document_state (doc_id, etag, checksum, last_ingested_at, upsert_completed)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(doc_id) DO UPDATE SET
                etag = excluded.etag,
                checksum = excluded.checksum,
                last_ingested_at = excluded.last_ingested_at,
                upsert_completed = excluded.upsert_completed
        """, (doc_id, etag, checksum, now, int(upsert_completed)))
        conn.commit()
        conn.close()
    
    def update_etag_only(self, doc_id: str, etag: str):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE document_state SET etag = ? WHERE doc_id = ?",
            (etag, doc_id)
        )
        conn.commit()
        conn.close()
    
    def get_all_doc_ids(self) -> set[str]:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT doc_id FROM document_state")
        rows = cursor.fetchall()
        conn.close()
        return {row[0] for row in rows}
    
    def mark_upsert_complete(self, doc_id: str):
        """Mark that a document's chunks have been successfully upserted to Qdrant."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE document_state SET upsert_completed = 1 WHERE doc_id = ?",
            (doc_id,)
        )
        conn.commit()
        conn.close()
    
    def delete(self, doc_id: str):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM document_state WHERE doc_id = ?", (doc_id,))
        conn.commit()
        conn.close()
