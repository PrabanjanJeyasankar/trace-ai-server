
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.responses import JSONResponse
import uvicorn
from dotenv import load_dotenv
from r2 import list_pdf_objects


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
     
        print(f"\nAll documents:")
        for doc in documents[:5]:
            print(f"  - {doc.object_key} ({doc.size} bytes)")
        
        if len(documents) > 5:
            print(f"  ... and {len(documents) - 5} more")
    
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
