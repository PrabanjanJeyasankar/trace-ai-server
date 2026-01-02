#!/usr/bin/env sh
set -e

echo "Starting embedding service on :8001..."
/app/embedding-service/venv/bin/uvicorn main:app --app-dir /app/embedding-service --host 0.0.0.0 --port 8001 &
EMBEDDING_PID=$!

echo "Starting reranker service on :8000..."
/app/reranker-service/venv/bin/uvicorn main:app --app-dir /app/reranker-service --host 0.0.0.0 --port 8000 &
RERANKER_PID=$!

# Function to check if service is ready
wait_for_service() {
  local url=$1
  local service_name=$2
  local max_attempts=30
  local attempt=1
  
  echo "Waiting for $service_name to be ready at $url..."
  
  while [ $attempt -le $max_attempts ]; do
    if curl -f "$url" >/dev/null 2>&1; then
      echo "✓ $service_name is ready"
      return 0
    fi
    echo "Attempt $attempt/$max_attempts: $service_name not ready yet..."
    sleep 2
    attempt=$((attempt + 1))
  done
  
  echo "ERROR: $service_name failed to start after $max_attempts attempts"
  return 1
}

# Wait for both services to be ready
wait_for_service "http://localhost:8001/health" "Embedding service"
wait_for_service "http://localhost:8000/health" "Reranker service"

# Double-check processes are still alive
if ! kill -0 $EMBEDDING_PID 2>/dev/null; then
  echo "ERROR: Embedding service process died"
  exit 1
fi

if ! kill -0 $RERANKER_PID 2>/dev/null; then
  echo "ERROR: Reranker service process died"
  exit 1
fi

echo "All services ready. Starting node server on :${PORT:-8080}..."
npm run start &
NODE_PID=$!

# Wait for Node process (keeps container alive)
wait $NODE_PID
