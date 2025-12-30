FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for layer caching
COPY requirements.txt .

# Install PyTorch CPU-only first (smaller and faster)
RUN pip install --no-cache-dir --default-timeout=100 \
    torch --index-url https://download.pytorch.org/whl/cpu

# Install remaining dependencies
RUN pip install --no-cache-dir --default-timeout=100 -r requirements.txt

# Copy application code
COPY main.py .

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8001/health')" || exit 1

# Expose port
EXPOSE 8001

# Run with uvicorn directly with proper timeouts
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--timeout-keep-alive", "75", "--timeout-graceful-shutdown", "10"]
