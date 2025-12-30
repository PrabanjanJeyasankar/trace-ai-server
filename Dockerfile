# -----------------------------------------------------------------------------
# Use platform-aware Node image so Docker chooses ARM on AWS and x86 on local.
# Debian-slim avoids Alpine's musl issues (bcrypt, sharp, native modules).
# -----------------------------------------------------------------------------
FROM --platform=$TARGETPLATFORM node:20-slim AS base

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-venv \
    python3-pip \
    build-essential \
  && rm -rf /var/lib/apt/lists/*

COPY embedding-service/requirements.txt ./embedding-service/requirements.txt
COPY reranker-service/requirements.txt ./reranker-service/requirements.txt

RUN python3 -m venv /app/embedding-service/venv \
  && /app/embedding-service/venv/bin/pip install --no-cache-dir -r /app/embedding-service/requirements.txt

RUN python3 -m venv /app/reranker-service/venv \
  && /app/reranker-service/venv/bin/pip install --no-cache-dir -r /app/reranker-service/requirements.txt

COPY . .

EXPOSE 3000 8000 8001

# Start API + embedding + reranker in one container
CMD ["./start-all.sh"]
