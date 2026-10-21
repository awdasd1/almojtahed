#!/usr/bin/env bash
# ==============================================================================
# سكربت تشغيل محرك ومخزن المتجهات Qdrant لمنظومة المجتهد
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=================================================="
echo "🚀 تشغيل مخزن المتجهات Qdrant (منظومة المجتهد)"
echo "📡 المنفذ: http://localhost:6333"
echo "🗄️ مسار البيانات: $SCRIPT_DIR/storage"
echo "=================================================="

if [ -f "./qdrant" ]; then
    chmod +x ./qdrant
    exec ./qdrant --config-path ./config/config.yaml
else
    echo "⚠️ الملف التنفيذي المحلي qdrant غير موجود لمعمارية هذا الجهاز."
    echo "💡 يمكنك تشغيل Qdrant فوراً عبر دوكر (Docker) بربط نفس مسار التخزين:"
    echo "docker run -p 6333:6333 -p 6334:6334 -v \"$SCRIPT_DIR/storage:/qdrant/storage\" qdrant/qdrant"
fi
