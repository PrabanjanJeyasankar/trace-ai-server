#!/usr/bin/env sh
set -e

echo "=== Starting Trace AI Server ==="

# Start Node.js server FIRST so Cloud Run detects port 8080 immediately
echo "[1/3] Starting Node.js server on port ${PORT:-8080}..."
npm run start &
NODE_PID=$!

# Give Node.js 3 seconds to bind to port
sleep 3

# Check if Node.js started successfully
if ! kill -0 $NODE_PID 2>/dev/null; then
  echo "ERROR: Node.js server failed to start"
  exit 1
fi

echo "✓ Node.js server is running (PID: $NODE_PID)"

# Start Python services in background (they can take time to load models)
echo "[2/3] Starting embedding service on port 8001..."
/app/embedding-service/venv/bin/uvicorn main:app \
  --app-dir /app/embedding-service \
  --host 0.0.0.0 \
  --port 8001 \
  --log-level warning &
EMBEDDING_PID=$!

echo "[3/3] Starting reranker service on port 8000..."
/app/reranker-service/venv/bin/uvicorn main:app \
  --app-dir /app/reranker-service \
  --host 0.0.0.0 \
  --port 8000 \
  --log-level warning &
RERANKER_PID=$!

echo "=== All services started ==="
echo "  Node.js:    PID $NODE_PID (port ${PORT:-8080})"
echo "  Embedding:  PID $EMBEDDING_PID (port 8001)"
echo "  Reranker:   PID $RERANKER_PID (port 8000)"
echo ""
echo "Note: Python services are loading models in background..."

# Wait for Node.js process (keeps container alive)
wait $NODE_PID
