
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
        "QDRANT_URL",
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
        embedder = LocalEmbedder()
        vector_store = QdrantVectorStore()
        deletion_reconciler = DeletionReconciler(state_store, vector_store)
        
        current_doc_ids = {doc.doc_id for doc in documents}
        deleted_count, deletion_error = deletion_reconciler.reconcile_deletions(current_doc_ids)
        
        if deletion_error:
            print(f"Warning: Deletion reconciliation failed: {deletion_error}")
        elif deleted_count > 0:
            print(f"Deleted {deleted_count} stale document(s) from vector store")
        else:
            print("No deletions needed")
        
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
            
            total_chunks = 0
            parse_failures = 0
            all_text_chunks = []
            
            for result in fetch_results:
                if not result.success or result.doc_id in failed_downloads:
                    continue
                
                doc_meta = documents_map.get(result.doc_id)
                if not doc_meta:
                    continue
                
                pages, failure_reason = parser.parse(result.doc_id, result.file_bytes)
                
                if failure_reason:
                    print(f"  {failure_reason}: {result.doc_id}")
                    parse_failures += 1
                    continue
                
                raw_chunks = chunker.chunk_pages(pages)
                text_chunks = enricher.enrich(
                    raw_chunks,
                    pages,
                    domain=doc_meta.domain,
                    doc_type="unknown"
                )
                
                all_text_chunks.extend(text_chunks)
                total_chunks += len(text_chunks)
                print(f"  Processed {result.doc_id}: {len(pages)} pages → {len(text_chunks)} chunks")
            
            print(f"\nChunking complete: {total_chunks} chunks created, {parse_failures} parse failures")
            
            if all_text_chunks:
                print(f"\nGenerating embeddings for {len(all_text_chunks)} chunks...")
                chunk_texts = [chunk.text for chunk in all_text_chunks]
                embedding_results = embedder.embed_batch(chunk_texts)
                
                embedding_success = sum(1 for _, vec in embedding_results if vec is not None)
                embedding_failures = len(embedding_results) - embedding_success
                
                print(f"Embedding complete: {embedding_success} succeeded, {embedding_failures} failed")
                
                chunk_data = []
                for chunk, (idx, vector) in zip(all_text_chunks, embedding_results):
                    if vector is None:
                        print(f"  FAILED_EMBEDDING: {chunk.chunk_id}")
                        continue
                    
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
                    }
                    
                    chunk_data.append({
                        "chunk_id": chunk.chunk_id,
                        "vector": vector,
                        "payload": payload
                    })
                
                if chunk_data:
                    print(f"\nUpserting {len(chunk_data)} chunks to Qdrant...")
                    upsert_success, upsert_failures = vector_store.upsert_chunks(chunk_data)
                    print(f"Upsert complete: {upsert_success} succeeded, {upsert_failures} failed")
                else:
                    print("\nNo chunks to upsert (all embeddings failed)")
            else:
                print("\nNo chunks to embed (all parsing/chunking failed)")
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
