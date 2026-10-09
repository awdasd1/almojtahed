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

RUN chmod +x ./entrypoint.sh

# Expose web application port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8000/ || exit 1

ENTRYPOINT ["./entrypoint.sh"]
