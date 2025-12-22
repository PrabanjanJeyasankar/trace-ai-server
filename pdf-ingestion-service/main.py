
import os
from fastapi import FastAPI
from fastapi.responses import JSONResponse
import uvicorn
from dotenv import load_dotenv


load_dotenv()

app = FastAPI(
    title="PDF Ingestion Service",
    description="Microservice for ingesting legal PDFs and preparing them for RAG",
    version="1.0.0"
)

@app.get("/health")
async def health_check():
    """
    Health check endpoint for Docker health checks and monitoring.
    Returns basic service status.
    """
    return JSONResponse(
        status_code=200,
        content={"status": "ok", "service": "pdf-ingestion-service"}
    )

@app.on_event("startup")
async def startup_event():
    """
    Service startup event handler.
    Validates required environment variables and initializes dependencies.
    """
    print(" PDF Ingestion Service starting...")
    
    required_env_vars = []
    
    missing_vars = [var for var in required_env_vars if not os.getenv(var)]
    
    if missing_vars:
        raise ValueError(f"Missing required environment variables: {', '.join(missing_vars)}")
    
    print(" PDF Ingestion Service ready")

@app.on_event("shutdown")
async def shutdown_event():
    """
    Service shutdown event handler.
    Cleanup resources if needed.
    """
    print(" PDF Ingestion Service shutting down...")

if __name__ == "__main__":
    # Run the service
    port = int(os.getenv("PDF_INGESTION_PORT", "8003"))
    uvicorn.run(app, host="0.0.0.0", port=port)
