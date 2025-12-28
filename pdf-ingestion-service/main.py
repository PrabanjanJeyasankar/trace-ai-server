
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
from parsing import PdfParser
from chunking import LegalChunker, MetadataEnricher
from embedding import LocalEmbedder
from vectorstore import QdrantVectorStore
from reconciliation import DeletionReconciler


load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(" PDF Ingestion Service starting...")
    
    required_env_vars = [
        "CLOUDFLARE_ACCOUNT_ID",
        "CLOUDFLARE_R2_ACCESS_KEY_ID",
        "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
        "CLOUDFLARE_R2_BUCKET_NAME",
        "CLOUDFLARE_R2_PUBLIC_DOMAIN",
        "QDRANT_URL",
    ]
    
    missing_vars = [var for var in required_env_vars if not os.getenv(var)]
    
    if missing_vars:
        raise ValueError(f"Missing required environment variables: {', '.join(missing_vars)}")
    
    # List R2 objects (early failure if R2 is unavailable)
    try:
        documents = list_pdf_objects()
    except Exception as e:
        print(f"ERROR: Failed to list R2 objects: {e}")
        print(" PDF Ingestion Service starting in degraded mode (R2 unavailable)")
        yield
        print(" PDF Ingestion Service shutting down...")
        return
    
    print(f"Discovered {len(documents)} PDF documents in bucket {os.getenv('CLOUDFLARE_R2_BUCKET_NAME')}")
    
    total_size_mb = sum(doc.size for doc in documents) / (1024 * 1024)
    print(f"Total size: {total_size_mb:.2f} MB")
    
    domains = {}
    for doc in documents:
        domains[doc.domain] = domains.get(doc.domain, 0) + 1
    
    print(f"Domains: {dict(sorted(domains.items()))}")
    
    # Initialize services
    r2_client = get_r2_client()
    db_path = os.getenv("SQLITE_DB_PATH", "/app/state/ingestion_state.db")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    state_store = DocumentStateStore(db_path=db_path)
    decision_engine = IngestionDecisionEngine(r2_client, state_store)
    embedder = LocalEmbedder()
    vector_store = QdrantVectorStore()
    deletion_reconciler = DeletionReconciler(state_store, vector_store)
    
    # Reconcile deletions
    current_doc_ids = {doc.doc_id for doc in documents}
    deleted_count, deletion_error = deletion_reconciler.reconcile_deletions(current_doc_ids)
    
    if deletion_error:
        print(f"Warning: Deletion reconciliation failed: {deletion_error}")
    elif deleted_count > 0:
        print(f"Deleted {deleted_count} stale document(s) from vector store")
    else:
        print("No deletions needed")
    
    # Process ingestion decisions
    print("\nProcessing decisions:")
    ingest_count = 0
    skip_count = 0
    reingest_count = 0
    download_candidates = []
    documents_map = {doc.doc_id: doc for doc in documents}
    
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
        
        failed_downloads = []
        for result in fetch_results:
            if not result.success:
                print(f"  FAILED_DOWNLOAD: {result.doc_id} - {result.error}")
                failed_downloads.append(result.doc_id)
        
        print(f"\nProcessing PDFs into chunks...")
        parser = PdfParser()
        chunker = LegalChunker()
        enricher = MetadataEnricher()
        
        # Group results by document for per-doc processing
        doc_chunks_map = {}
        parse_failures = []
        
        for result in fetch_results:
            if not result.success or result.doc_id in failed_downloads:
                continue
            
            doc_meta = documents_map.get(result.doc_id)
            if not doc_meta:
                continue
            
            pages, failure_reason = parser.parse(result.doc_id, result.file_bytes)
            
            if failure_reason:
                print(f"  {failure_reason}: {result.doc_id}")
                parse_failures.append(result.doc_id)
                continue
            
            raw_chunks = chunker.chunk_pages(pages)
            text_chunks = enricher.enrich(
                raw_chunks,
                pages,
                domain=doc_meta.domain,
                doc_type="unknown"
            )
            
            doc_chunks_map[result.doc_id] = (text_chunks, doc_meta)
            print(f"  Processed {result.doc_id}: {len(pages)} pages → {len(text_chunks)} chunks")
        
        print(f"\nChunking complete: {len(doc_chunks_map)} documents ready, {len(parse_failures)} parse failures")
        
        # Process each document: embed → delete-before-upsert → mark complete
        if doc_chunks_map:
            embedder = LocalEmbedder()
            total_docs = len(doc_chunks_map)
            successful_upserts = 0
            failed_upserts = []
            
            for doc_num, (doc_id, (text_chunks, doc_meta)) in enumerate(doc_chunks_map.items(), 1):
                print(f"\n[{doc_num}/{total_docs}] Processing {doc_id}...")
                
                # Step 1: Generate embeddings
                print(f"  Generating embeddings for {len(text_chunks)} chunks...")
                chunk_texts = [chunk.text for chunk in text_chunks]
                embedding_results = embedder.embed_batch(chunk_texts)
                
                embedding_success = sum(1 for _, vec in embedding_results if vec is not None)
                embedding_failures = len(embedding_results) - embedding_success
                
                if embedding_failures > 0:
                    print(f"  Embedding failures: {embedding_failures}/{len(text_chunks)}")
                
                # Prepare chunk data
                chunk_data = []
                for chunk, (idx, vector) in zip(text_chunks, embedding_results):
                    if vector is None:
                        continue
                    
                    r2_public_domain = os.getenv("CLOUDFLARE_R2_PUBLIC_DOMAIN", "")
                    pdf_url = f"{r2_public_domain}/{chunk.doc_id}" if r2_public_domain else ""
                    
                    payload = {
                        "doc_id": chunk.doc_id,
                        "page_number": chunk.page_number,
                        "page_label": chunk.page_label,
                        "chunk_index": chunk.chunk_index,
                        "text": chunk.text,
                        "doc_type": chunk.doc_type,
                        "domain": chunk.domain,
                        "source": chunk.source,
                        "source_system": chunk.source_system,
                        "pdf_url": pdf_url,
                    }
                    
                    chunk_data.append({
                        "chunk_id": chunk.chunk_id,
                        "vector": vector,
                        "payload": payload
                    })
                
                if not chunk_data:
                    print(f"  ✗ Skipping upsert: all embeddings failed")
                    failed_upserts.append((doc_id, "All embeddings failed"))
                    continue
                
                # Step 2: Delete existing chunks (clean slate)
                print(f"  Deleting existing chunks for {doc_id}...")
                del_success, del_error = vector_store.delete_by_doc_id(doc_id)
                if not del_success:
                    print(f"  Warning: deletion failed: {del_error} (continuing anyway)")
                
                # Step 3: Upsert all chunks in batches
                upsert_success, upsert_error = vector_store.upsert_chunks(chunk_data)
                
                if upsert_success:
                    # Step 4: Mark as complete in state
                    state_store.mark_upsert_complete(doc_id)
                    successful_upserts += 1
                    print(f"  ✓ Successfully upserted {len(chunk_data)} chunks")
                else:
                    failed_upserts.append((doc_id, upsert_error))
                    print(f"  ✗ Upsert failed: {upsert_error}")
            
            print(f"\n=== Ingestion Complete ===")
            print(f"Successful: {successful_upserts}/{total_docs} documents")
            if failed_upserts:
                print(f"Failed: {len(failed_upserts)} documents")
                for doc_id, error in failed_upserts:
                    print(f"  - {doc_id}: {error}")
        else:
            print("\nNo documents ready for embedding/upsert")
    else:
        print("\nNo PDFs to download (all skipped)")
    
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
