import math
import os
import time
from typing import List, Optional, Union
import multiprocessing
import torch

from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import CrossEncoder

app = FastAPI(title="Local Reranker", version="1.0.0")

MODEL_NAME = os.getenv("RERANKER_MODEL", "BAAI/bge-reranker-base")

# ANSI color codes
BLUE = '\033[34m'
CYAN = '\033[36m'
GREEN = '\033[32m'
MAGENTA = '\033[35m'
YELLOW = '\033[33m'
RED = '\033[31m'
RESET = '\033[0m'
BOLD = '\033[1m'

# Detect available CPU cores
CPU_CORES = multiprocessing.cpu_count()
OMP_THREADS = int(os.getenv("OMP_NUM_THREADS", str(CPU_CORES)))

# Set environment variables for optimal CPU performance
os.environ["OMP_NUM_THREADS"] = str(OMP_THREADS)
os.environ["MKL_NUM_THREADS"] = str(OMP_THREADS)
os.environ["OPENBLAS_NUM_THREADS"] = str(OMP_THREADS)
os.environ["VECLIB_MAXIMUM_THREADS"] = str(OMP_THREADS)
os.environ["NUMEXPR_NUM_THREADS"] = str(OMP_THREADS)

# Configure PyTorch for optimal CPU inference
torch.set_num_threads(OMP_THREADS)
torch.set_num_interop_threads(max(1, OMP_THREADS // 2))

print(f"{BLUE}============================================================{RESET}")
print(f"{CYAN}  Reranker Service{RESET}")
print(f"{BLUE}------------------------------------------------------------{RESET}")
print(f"{GREEN}  System Cores    :{RESET} {CPU_CORES}")
print(f"{GREEN}  Threads         :{RESET} {OMP_THREADS}")
print(f"{GREEN}  Interop Threads :{RESET} {max(1, OMP_THREADS // 2)}")
print(f"{MAGENTA}  Model           :{RESET} {MODEL_NAME}")
print(f"{BLUE}------------------------------------------------------------{RESET}")
print(f"{YELLOW}  Loading model...{RESET}")

load_start = time.time()

# Optimize for CPU inference
model = CrossEncoder(MODEL_NAME, max_length=512)

# Set to evaluation mode and disable gradients for faster inference
if hasattr(model, 'model'):
    model.model.eval()
    for param in model.model.parameters():
        param.requires_grad = False

load_time = time.time() - load_start
print(f"{GREEN}  Model loaded in {load_time:.2f}s{RESET}")
print(f"{BLUE}============================================================{RESET}")
print(f"{GREEN}  Service ready on port 8000{RESET}")
print(f"{BLUE}============================================================{RESET}\n")


def sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


class RerankRequest(BaseModel):
    query: str
    documents: List[str]


class JsonRpcRequest(BaseModel):
    jsonrpc: str
    method: str
    params: Optional[dict] = None
    id: Optional[Union[int, str]] = None


@app.get("/health")
def health():
    return {"status": "ok"}


def run_rerank(query: str, documents: List[str]):
    start = time.time()
    doc_count = len(documents)

    print(f"{CYAN}[Reranker]{RESET} Processing {doc_count} documents")

    # Build pairs
    pair_start = time.time()
    pairs = [[query, d] for d in documents]
    pair_time = (time.time() - pair_start) * 1000

    # Predict scores with optimized batch size and no conversion overhead
    predict_start = time.time()
    with torch.no_grad():
        raw_scores = model.predict(
            pairs,
            batch_size=64,
            show_progress_bar=False,
            convert_to_numpy=True,
            convert_to_tensor=False,
        )
    predict_time = (time.time() - predict_start) * 1000
    print(
        f"{CYAN}[Reranker]{RESET} Prediction: {predict_time:.1f}ms | {doc_count} docs | {predict_time/doc_count:.1f}ms/doc"
    )

    # Apply sigmoid efficiently
    sigmoid_start = time.time()
    results = [
        {"index": i, "score": float(sigmoid(float(score)))}
        for i, score in enumerate(raw_scores)
    ]
    sigmoid_time = (time.time() - sigmoid_start) * 1000

    total_time = (time.time() - start) * 1000
    print(f"{GREEN}[Reranker]{RESET} Complete: {total_time:.1f}ms | {doc_count} docs")

    return results


@app.post("/rerank")
def rerank(req: RerankRequest):
    return run_rerank(req.query, req.documents)


@app.post("/rpc")
def rpc(req: JsonRpcRequest):
    if req.jsonrpc != "2.0":
        return {
            "jsonrpc": "2.0",
            "error": {"code": -32600, "message": "Invalid JSON-RPC version"},
            "id": req.id,
        }

    if req.method != "rerank":
        return {
            "jsonrpc": "2.0",
            "error": {"code": -32601, "message": "Method not found"},
            "id": req.id,
        }

    params = req.params or {}
    query = params.get("query")
    documents = params.get("documents")

    if not isinstance(query, str) or not isinstance(documents, list):
        return {
            "jsonrpc": "2.0",
            "error": {"code": -32602, "message": "Invalid params"},
            "id": req.id,
        }

    print("[RPC] rerank")
    result = run_rerank(query, documents)

    return {"jsonrpc": "2.0", "result": result, "id": req.id}
