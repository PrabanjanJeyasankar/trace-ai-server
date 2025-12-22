
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.responses import JSONResponse
import uvicorn
from dotenv import load_dotenv
from r2 import list_pdf_objects, get_r2_client
from state import DocumentStateStore
from ingestion import IngestionDecisionEngine, IngestionDecision
from fetch import PdfFetcher


load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(" PDF Ingestion Service starting...")
    
    required_env_vars = [
        "CLOUDFLARE_ACCOUNT_ID",
        "CLOUDFLARE_R2_ACCESS_KEY_ID",
        "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
        "CLOUDFLARE_R2_BUCKET_NAME",
    ]
    
    missing_vars = [var for var in required_env_vars if not os.getenv(var)]
    
    if missing_vars:
        raise ValueError(f"Missing required environment variables: {', '.join(missing_vars)}")
    
    try:
        documents = list_pdf_objects()
        print(f"Discovered {len(documents)} PDF documents in bucket {os.getenv('CLOUDFLARE_R2_BUCKET_NAME')}")
        
        total_size_mb = sum(doc.size for doc in documents) / (1024 * 1024)
        print(f"Total size: {total_size_mb:.2f} MB")
        
        domains = {}
        for doc in documents:
            domains[doc.domain] = domains.get(doc.domain, 0) + 1
        
        print(f"Domains: {dict(sorted(domains.items()))}")
        
        r2_client = get_r2_client()
        state_store = DocumentStateStore()
        decision_engine = IngestionDecisionEngine(r2_client, state_store)
        
        print("\nProcessing decisions:")
        ingest_count = 0
        skip_count = 0
        reingest_count = 0
        download_candidates = []
        
        for doc in documents:
            decision, checksum = decision_engine.decide(doc)
            
            if decision == IngestionDecision.INGEST:
                print(f"  INGEST   {doc.object_key}")
                decision_engine.mark_ingested(doc, checksum)
                download_candidates.append((doc.doc_id, doc.object_key))
                ingest_count += 1
            elif decision == IngestionDecision.SKIP:
                print(f"  SKIP     {doc.object_key} (etag unchanged)")
                skip_count += 1
            elif decision == IngestionDecision.REINGEST:
                print(f"  REINGEST {doc.object_key} (checksum changed)")
                decision_engine.mark_ingested(doc, checksum)
                download_candidates.append((doc.doc_id, doc.object_key))
                reingest_count += 1
        
        print(f"\nSummary: {ingest_count} INGEST, {skip_count} SKIP, {reingest_count} REINGEST")
        
        if download_candidates:
            print(f"\nDownloading {len(download_candidates)} PDFs with bounded concurrency (max 3)...")
            fetcher = PdfFetcher(r2_client)
            fetch_results = fetcher.fetch_pdfs(download_candidates)
            
            success_count = sum(1 for r in fetch_results if r.success)
            failed_count = sum(1 for r in fetch_results if not r.success)
            
            print(f"Download complete: {success_count} succeeded, {failed_count} failed")
            
            for result in fetch_results:
                if not result.success:
                    print(f"  FAILED_DOWNLOAD: {result.doc_id} - {result.error}")
        else:
            print("\nNo PDFs to download (all skipped)")
    
    except Exception as e:
        print(f"Warning: Could not list R2 objects: {e}")
    
    print(" PDF Ingestion Service ready")
    
    yield
    
    print(" PDF Ingestion Service shutting down...")


app = FastAPI(
    title="PDF Ingestion Service",
    description="Microservice for ingesting legal PDFs and preparing them for RAG",
    version="1.0.0",
    lifespan=lifespan
)

@app.get("/health")
async def health_check():
    return JSONResponse(
        status_code=200,
        content={"status": "ok", "service": "pdf-ingestion-service"}
    )


if __name__ == "__main__":
    port = int(os.getenv("PDF_INGESTION_PORT", "8003"))
    uvicorn.run(app, host="0.0.0.0", port=port)
