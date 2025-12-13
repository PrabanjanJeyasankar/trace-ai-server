#!/bin/bash

echo " Starting Ollama setup..."

echo "Waiting for Ollama service to be ready..."
until curl -s http://ollama:11434/api/tags > /dev/null 2>&1; do
  echo " Ollama not ready yet, waiting..."
  sleep 2
done

echo "Ollama is ready!"

MODEL="${OLLAMA_MODEL:-llama3.1:8b}"

echo " Pulling Ollama model: $MODEL"
echo "This may take several minutes on first run..."

curl -X POST http://ollama:11434/api/pull \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"$MODEL\"}" \
  --no-buffer

echo ""
echo " Ollama model $MODEL is ready!"
echo "Setup complete!"
