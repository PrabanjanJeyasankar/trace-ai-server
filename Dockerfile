# -----------------------------------------------------------------------------
# Use platform-aware Node image so Docker chooses ARM on AWS and x86 on local.
# Debian-slim avoids Alpine's musl issues (bcrypt, sharp, native modules).
# -----------------------------------------------------------------------------
FROM node:20-slim AS base

WORKDIR /app

# Install system dependencies first
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-venv \
    python3-pip \
    build-essential \
  && rm -rf /var/lib/apt/lists/* \
  && apt-get clean

# Copy and install Node dependencies
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Copy Python requirements and install in virtual environments
COPY embedding-service/requirements.txt ./embedding-service/requirements.txt
COPY reranker-service/requirements.txt ./reranker-service/requirements.txt

# Create virtual environments and install Python dependencies
RUN python3 -m venv /app/embedding-service/venv \
  && /app/embedding-service/venv/bin/pip install --no-cache-dir --no-deps -r /app/embedding-service/requirements.txt

RUN python3 -m venv /app/reranker-service/venv \
  && /app/reranker-service/venv/bin/pip install --no-cache-dir --no-deps -r /app/reranker-service/requirements.txt

# Copy application code
COPY . .

# Set environment variables for production
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080 8000 8001

# Start API + embedding + reranker in one container
CMD ["./start-all.sh"]
