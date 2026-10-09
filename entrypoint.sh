#!/bin/bash
set -e

echo "=========================================================="
echo "📚 Starting Shamela AI Web Application (Coolify / Docker)"
echo "=========================================================="

# 1. Automatic Database Asset Download from Hugging Face if configured
if [ -n "$HF_DATASET_REPO" ]; then
    DATA_TARGET_DIR="${DATA_DIR:-/app/data}"
    INDEX_DB_TARGET="${SHAMELA_INDEX_DB:-/app/shamela_index.db}"

    if [ ! -f "$INDEX_DB_TARGET" ] && [ ! -d "$DATA_TARGET_DIR/collections" ]; then
        echo "🌐 HF_DATASET_REPO detected: $HF_DATASET_REPO"
        echo "📥 Fetching database assets from Hugging Face..."
        mkdir -p "$DATA_TARGET_DIR"

        HF_CMD="huggingface-cli download $HF_DATASET_REPO --local-dir $DATA_TARGET_DIR"
        if [ -n "$HF_TOKEN" ]; then
            HF_CMD="$HF_CMD --token $HF_TOKEN"
        fi

        echo "🚀 Running: $HF_CMD"
        eval "$HF_CMD" || echo "⚠️ Warning: Failed to download from Hugging Face, continuing with existing files..."
        
        # If an index.db was downloaded into the data folder, link or copy it
        if [ -f "$DATA_TARGET_DIR/shamela_index.db" ] && [ ! -f "$INDEX_DB_TARGET" ]; then
            cp "$DATA_TARGET_DIR/shamela_index.db" "$INDEX_DB_TARGET"
        fi
        echo "✅ Asset check complete."
    else
        echo "✅ Database assets already present in persistent volume. Skipping download."
    fi
fi

# 2. Wait for Qdrant service if QDRANT_URL is specified (e.g. in docker-compose)
if [ -n "$QDRANT_URL" ]; then
    echo "🔍 Checking Qdrant connection at $QDRANT_URL..."
    MAX_RETRIES=20
    RETRY_COUNT=0
    until curl -s "$QDRANT_URL/readyz" >/dev/null 2>&1 || [ $RETRY_COUNT -ge $MAX_RETRIES ]; do
        echo "⏳ Waiting for Qdrant to be ready ($((RETRY_COUNT+1))/$MAX_RETRIES)..."
        sleep 2
        RETRY_COUNT=$((RETRY_COUNT+1))
    done
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo "⚠️ Note: Qdrant readyz probe timed out, attempting to continue anyway..."
    else
        echo "✅ Qdrant service is online!"
    fi
fi

APP_PORT="${PORT:-8000}"
echo "🚀 Launching FastAPI Uvicorn Server on 0.0.0.0:$APP_PORT..."
exec uvicorn web_app.app:app --host 0.0.0.0 --port "$APP_PORT" --workers "${WEB_CONCURRENCY:-1}"
