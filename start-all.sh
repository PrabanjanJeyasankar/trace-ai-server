#!/usr/bin/env sh
set -e

# Start Node server FIRST so Render detects the port immediately
echo "Starting node server on :${PORT:-3000}..."
npm run start &
NODE_PID=$!

# Give Node a moment to bind to port before starting Python services
sleep 2

echo "Starting embedding service on :8001..."
/app/embedding-service/venv/bin/uvicorn main:app --app-dir /app/embedding-service --host 0.0.0.0 --port 8001 &

echo "Starting reranker service on :8000..."
/app/reranker-service/venv/bin/uvicorn main:app --app-dir /app/reranker-service --host 0.0.0.0 --port 8000 &

# Wait for Node process (keeps container alive)
wait $NODE_PID
