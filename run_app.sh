#!/bin/bash
# سكريبت تشغيل/إعادة تشغيل تطبيق الشاملة الذكي
cd "$(dirname "$0")"

PORT=8000

echo "🔍 فحص المنفذ $PORT..."
PID=$(lsof -t -i :$PORT)
if [ -n "$PID" ]; then
    echo "⚠️ تم العثور على نسخة سابقة قيد التشغيل (PID: $PID)، جاري إيقافها..."
    kill -9 $PID 2>/dev/null
    sleep 1
    echo "✅ تم إيقاف النسخة السابقة."
fi

echo "🚀 جاري تشغيل التطبيق عبر uvicorn (مع خاصية التحديث التلقائي --reload)..."
./.venv/bin/python -m uvicorn web_app.app:app --host 0.0.0.0 --port $PORT --reload
