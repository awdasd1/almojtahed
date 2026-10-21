#!/usr/bin/env bash
# ==============================================================================
# منظومة المجتهد - سكربت بدء التشغيل والتهيئة السحابية للحاوية
# ==============================================================================

set -e

echo "=========================================================="
echo "🌟 بدء تشغيل منصة المجتهد على Coolify / Docker"
echo "=========================================================="

# 1. تهيئة ملف البيئة .env إذا لم يكن موجوداً
if [ ! -f /app/.env ]; then
    echo "📄 نسخ .env.example إلى .env..."
    cp /app/.env.example /app/.env
fi

# 2. فحص هل يوجد خادم Qdrant متاح، وإن لم يتوفر يتم تشغيل محرك Qdrant المدمج تلقائياً
echo "📡 التحقق من جاهزية محرك Qdrant..."
if ! curl -s http://qdrant:6333/collections >/dev/null 2>&1 && ! curl -s http://localhost:6333/collections >/dev/null 2>&1; then
    if [ -f /app/qdrant_service/qdrant ]; then
        echo "⚡ جاري تشغيل محرك Qdrant المدمج داخل الحاوية..."
        mkdir -p /app/qdrant_service/storage /app/qdrant_service/snapshots /app/qdrant_service/config
        cd /app/qdrant_service
        ./qdrant --config-path /app/qdrant_service/config/config.yaml > /app/qdrant_service/qdrant.log 2>&1 &
        cd /app
        sleep 4
    fi
fi

# 3. فحص وتهيئة بيانات Hugging Face واللقطة في خلفية التشغيل إذا لم تكن موجودة
echo "🔄 فحص جاهزية مخازن الشاملة والمتجهات والموديلات من Hugging Face..."
python3 /app/init_coolify_data.py || {
    echo "⚠️ تم تسجيل ملاحظة أثناء جلب البيانات، يستمر الخادم في الإقلاع..."
}

# 3. إطلاق خادم التطبيق
echo "🚀 تشغيل خادم المجتهد (FastAPI)..."
cd /app/web_ui
exec python3 server.py
