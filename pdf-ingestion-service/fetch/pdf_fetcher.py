import time
from typing import Optional
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor, as_completed
from r2.client import R2Client


MAX_CONCURRENT_DOWNLOADS = 3
MAX_RETRIES = 2


@dataclass
class PdfFetchResult:
    doc_id: str
    object_key: str
    file_bytes: Optional[bytes] = None
    success: bool = True
    error: Optional[str] = None


class PdfFetcher:
    def __init__(self, r2_client: R2Client):
        self.r2_client = r2_client
    
    def _download_with_retry(self, object_key: str, max_retries: int = MAX_RETRIES) -> bytes:
        last_error = None
        
        for attempt in range(max_retries + 1):
            try:
                file_bytes = self.r2_client.download_pdf(object_key)
                if not isinstance(file_bytes, bytes):
                    raise TypeError(f"Expected bytes, got {type(file_bytes)}")
                return file_bytes
            except Exception as e:
                last_error = e
                if attempt < max_retries:
                    time.sleep(0.5 * (attempt + 1))
                    continue
                raise last_error
    
    def _fetch_single_pdf(self, doc_id: str, object_key: str) -> PdfFetchResult:
        try:
            print(f"Downloading PDF: {doc_id}")
            file_bytes = self._download_with_retry(object_key)
            
            if len(file_bytes) == 0:
                raise ValueError("Downloaded PDF is empty (0 bytes)")
            
            if not file_bytes.startswith(b'%PDF'):
                raise ValueError("Downloaded file is not a valid PDF (missing PDF header)")
            
            print(f"Downloaded PDF: {doc_id} ({len(file_bytes)} bytes)")
            
            return PdfFetchResult(
                doc_id=doc_id,
                object_key=object_key,
                file_bytes=file_bytes,
                success=True
            )
        
        except Exception as e:
            print(f"Failed PDF download: {doc_id} ({str(e)})")
            return PdfFetchResult(
                doc_id=doc_id,
                object_key=object_key,
                file_bytes=None,
                success=False,
                error=str(e)
            )
    
    def fetch_pdfs(self, candidates: list[tuple[str, str]]) -> list[PdfFetchResult]:
        if not candidates:
            return []
        
        results = []
        
        with ThreadPoolExecutor(max_workers=MAX_CONCURRENT_DOWNLOADS) as executor:
            futures = {
                executor.submit(self._fetch_single_pdf, doc_id, object_key): (doc_id, object_key)
                for doc_id, object_key in candidates
            }
            
            for future in as_completed(futures):
                result = future.result()
                results.append(result)
        
        return results
