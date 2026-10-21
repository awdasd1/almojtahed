# ==============================================================================
# منظومة المجتهد - ملف بناء الحاوية السحابية (Dockerfile for Coolify / Docker)
# ==============================================================================

FROM python:3.11-slim

# ضبط المتغيرات الأساسية
ENV PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    PORT=8085 \
    HOST=0.0.0.0

WORKDIR /app

# تثبيت متطلبات النظام الأساسية
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    git \
    aria2 \
    sqlite3 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# تثبيت اعتماديات بايثون
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# نسخ كود وملفات المنظومة البرمجية
COPY . .

# إنشاء مسارات التخزين للبيانات الخارجية
RUN mkdir -p /app/shamela4_data /app/models/gguf /app/models/embedding /app/models/reranker /app/qdrant_service/snapshots

# ضبط صلاحيات التشغيل للسكربتات
RUN chmod +x /app/init_coolify_data.py /app/entrypoint.sh /app/start_almujtahed.sh || true

EXPOSE 8085

ENTRYPOINT ["/app/entrypoint.sh"]
