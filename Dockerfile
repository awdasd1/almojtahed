# ==========================================
# Shamela AI Web Application Dockerfile
# Optimized for Coolify & GitHub deployments
# ==========================================
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# Copy application source code
COPY web_app/ ./web_app/
COPY scripts/ ./scripts/
COPY config.json ./config.json
COPY shamela_mcp.py ./shamela_mcp.py
COPY entrypoint.sh ./entrypoint.sh
COPY shamela_index.db ./shamela_index.db
COPY shamela4_data/_meta/ ./shamela4_data/_meta/
COPY ["mcp web/", "./mcp web/"]

RUN chmod +x ./entrypoint.sh

# Expose web application and Claude Web ports
EXPOSE 8000 3000 5173

# Health check with generous start-period for PyTorch / model initialization
HEALTHCHECK --interval=10s --timeout=5s --start-period=120s --retries=10 \
    CMD sh -c 'curl -sf "http://127.0.0.1:${PORT:-8000}/healthz" || curl -sf "http://127.0.0.1:3000/healthz" || curl -sf "http://127.0.0.1:8000/healthz" || curl -sf "http://127.0.0.1:${PORT:-8000}/" || exit 1'

ENTRYPOINT ["./entrypoint.sh"]
