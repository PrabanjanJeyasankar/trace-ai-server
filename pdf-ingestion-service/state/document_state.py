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
                last_ingested_at TEXT NOT NULL
            )
        """)
        conn.commit()
        conn.close()
    
    def get(self, doc_id: str) -> Optional[DocumentState]:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT doc_id, etag, checksum, last_ingested_at FROM document_state WHERE doc_id = ?",
            (doc_id,)
        )
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return DocumentState(
                doc_id=row[0],
                etag=row[1],
                checksum=row[2],
                last_ingested_at=row[3]
            )
        return None
    
    def upsert(self, doc_id: str, etag: str, checksum: str):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        now = datetime.utcnow().isoformat()
        cursor.execute("""
            INSERT INTO document_state (doc_id, etag, checksum, last_ingested_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(doc_id) DO UPDATE SET
                etag = excluded.etag,
                checksum = excluded.checksum,
                last_ingested_at = excluded.last_ingested_at
        """, (doc_id, etag, checksum, now))
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
