#!/usr/bin/env sh
set -e

echo "Starting embedding service on :8001..."
/app/embedding-service/venv/bin/uvicorn main:app --app-dir /app/embedding-service --host 0.0.0.0 --port 8001 &

echo "Starting reranker service on :8000..."
/app/reranker-service/venv/bin/uvicorn main:app --app-dir /app/reranker-service --host 0.0.0.0 --port 8000 &

echo "Starting node server on :${PORT:-3000}..."
exec npm run start
