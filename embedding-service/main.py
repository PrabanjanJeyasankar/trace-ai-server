import os
import time
from typing import List, Optional, Union
import multiprocessing
import torch

from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

app = FastAPI(title="Embedding Service", version="1.0.0")

MODEL_NAME = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
OUTPUT_DIM = int(os.getenv("OUTPUT_DIM", "384"))

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
print(f"{CYAN}  Embedding Service{RESET}")
print(f"{BLUE}------------------------------------------------------------{RESET}")
print(f"{GREEN}  System Cores    :{RESET} {CPU_CORES}")
print(f"{GREEN}  Threads         :{RESET} {OMP_THREADS}")
print(f"{GREEN}  Interop Threads :{RESET} {max(1, OMP_THREADS // 2)}")
print(f"{MAGENTA}  Model           :{RESET} {MODEL_NAME}")
print(f"{MAGENTA}  Output Dim      :{RESET} {OUTPUT_DIM}D")
print(f"{BLUE}------------------------------------------------------------{RESET}")
print(f"{YELLOW}  Loading model...{RESET}")

load_start = time.time()

# Load model with dimension configuration
model = SentenceTransformer(MODEL_NAME)

# Verify dimension
test_vec = model.encode("test", convert_to_numpy=True)
actual_dim = len(test_vec)
if actual_dim != OUTPUT_DIM:
    print(f"{YELLOW}  Warning: Model produces {actual_dim}D vectors, but OUTPUT_DIM={OUTPUT_DIM}{RESET}")
    print(f"{YELLOW}  Using model's native dimension: {actual_dim}D{RESET}")
    OUTPUT_DIM = actual_dim

load_time = time.time() - load_start
print(f"{GREEN}  Model loaded in {load_time:.2f}s{RESET}")
print(f"{BLUE}============================================================{RESET}")
print(f"{GREEN}  Service ready on port 8001{RESET}")
print(f"{BLUE}============================================================{RESET}\n")


class EmbedRequest(BaseModel):
    text: str


class EmbedBatchRequest(BaseModel):
    texts: List[str]


class JsonRpcRequest(BaseModel):
    jsonrpc: str
    method: str
    params: Optional[dict] = None
    id: Optional[Union[int, str]] = None


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model": MODEL_NAME,
        "dimension": OUTPUT_DIM,
    }


@app.post("/rpc")
async def rpc_handler(request: JsonRpcRequest):
    """JSON-RPC 2.0 endpoint for embedding operations"""
    
    if request.jsonrpc != "2.0":
        return {
            "jsonrpc": "2.0",
            "error": {
                "code": -32600,
                "message": "Invalid Request: jsonrpc must be '2.0'",
            },
            "id": request.id,
        }

    try:
        if request.method == "embed":
            # Single text embedding
            if not request.params or "text" not in request.params:
                return {
                    "jsonrpc": "2.0",
                    "error": {
                        "code": -32602,
                        "message": "Invalid params: 'text' is required",
                    },
                    "id": request.id,
                }

            text = request.params["text"]
            
            if not text or not isinstance(text, str):
                return {
                    "jsonrpc": "2.0",
                    "error": {
                        "code": -32602,
                        "message": "Invalid params: 'text' must be a non-empty string",
                    },
                    "id": request.id,
                }

            start = time.time()
            vector = model.encode(text, convert_to_numpy=True)
            duration = (time.time() - start) * 1000

            print(f"{CYAN}[Embedding]{RESET} Text: {len(text)} chars | Duration: {duration:.1f}ms | Dim: {OUTPUT_DIM}D")

            return {
                "jsonrpc": "2.0",
                "result": {
                    "vector": vector.tolist(),
                    "dimension": OUTPUT_DIM,
                    "model": MODEL_NAME,
                    "duration_ms": round(duration, 2),
                },
                "id": request.id,
            }

        elif request.method == "embed_batch":
            # Batch text embedding
            if not request.params or "texts" not in request.params:
                return {
                    "jsonrpc": "2.0",
                    "error": {
                        "code": -32602,
                        "message": "Invalid params: 'texts' is required",
                    },
                    "id": request.id,
                }

            texts = request.params["texts"]
            
            if not isinstance(texts, list) or not texts:
                return {
                    "jsonrpc": "2.0",
                    "error": {
                        "code": -32602,
                        "message": "Invalid params: 'texts' must be a non-empty list",
                    },
                    "id": request.id,
                }

            start = time.time()
            vectors = model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
            duration = (time.time() - start) * 1000

            print(f"{CYAN}[Embedding]{RESET} Batch: {len(texts)} texts | Duration: {duration:.1f}ms | Dim: {OUTPUT_DIM}D")

            return {
                "jsonrpc": "2.0",
                "result": {
                    "vectors": [v.tolist() for v in vectors],
                    "dimension": OUTPUT_DIM,
                    "model": MODEL_NAME,
                    "count": len(texts),
                    "duration_ms": round(duration, 2),
                },
                "id": request.id,
            }

        else:
            return {
                "jsonrpc": "2.0",
                "error": {
                    "code": -32601,
                    "message": f"Method not found: {request.method}",
                },
                "id": request.id,
            }

    except Exception as e:
        print(f"{RED}[Embedding]{RESET} Error: {str(e)}")
        return {
            "jsonrpc": "2.0",
            "error": {
                "code": -32603,
                "message": f"Internal error: {str(e)}",
            },
            "id": request.id,
        }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port)
