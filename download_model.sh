#!/bin/bash
# سكريبت تحميل نماذج Hugging Face مباشرة إلى مجلد models/
# يدعم التحميل السريع مع استئناف التحميل التلقائي (Resume) في حال انقطاع الاتصال

cd "$(dirname "$0")"

MODELS_DIR="$(pwd)/models"
mkdir -p "$MODELS_DIR"

HF_BIN="./.venv/bin/hf"

echo "=========================================================="
echo "   📥 أداة تحميل النماذج من Hugging Face إلى الشاملة     "
echo "=========================================================="
echo "📂 مجلد الحفظ: $MODELS_DIR"
echo ""

# إذا تم تمرير معاملات عبر سطر الأوامر
# الاستخدام: ./download_model.sh REPO_ID [FILENAME]
if [ -n "$1" ]; then
    REPO_ID=$(echo "$1" | sed -e 's|https://huggingface.co/||g' -e 's|http://huggingface.co/||g' -e 's|/tree/main.*||g' -e 's|/blob/main.*||g' -e 's|/$||g')
    FILENAME="$2"
    
    echo "🚀 جاري التحميل من المستودع: $REPO_ID"
    if [ -n "$FILENAME" ]; then
        echo "📄 الملف المحدد: $FILENAME"
        "$HF_BIN" download "$REPO_ID" "$FILENAME" --local-dir "$MODELS_DIR"
    else
        echo "📦 تحميل كافة ملفات المستودع (أو ملفات GGUF)..."
        "$HF_BIN" download "$REPO_ID" --include "*.gguf" --local-dir "$MODELS_DIR"
    fi
    
    echo ""
    echo "✅ اكتمل التحميل بنجاح! النماذج متوفرة الآن في واجهة التطبيق."
    exit 0
fi

# القائمة التفاعلية في حال التشغيل بدون معاملات
echo "اختر أحد النماذج الموصى بها عالية الدقة للغة العربية والتراث:"
echo "1) Qwen 2.5 7B Instruct (Q4_K_M) - ممتاز جداً وسريع ومتفوق بالعربية (~4.7 GB)"
echo "2) DeepSeek R1 Distill Qwen 7B (Q4_K_M) - تفكير واستدلال فقهي عميق (~4.7 GB)"
echo "3) Llama 3.2 3B Instruct (Q4_K_M) - فائق الخفة والسرعة للأجهزة المتوسطة (~2.0 GB)"
echo "4) إدخال رابط أو اسم مستودع مخصص من Hugging Face"
echo "5) خروج"
echo ""
read -p "أدخل رقم الخيار (1-5): " CHOICE

case "$CHOICE" in
    1)
        echo "⏳ جاري تحميل Qwen 2.5 7B Instruct GGUF (ملف موحد بصيغة Q4_K_M)..."
        "$HF_BIN" download bartowski/Qwen2.5-7B-Instruct-GGUF Qwen2.5-7B-Instruct-Q4_K_M.gguf --local-dir "$MODELS_DIR"
        ;;
    2)
        echo "⏳ جاري تحميل DeepSeek R1 Distill Qwen 7B GGUF..."
        "$HF_BIN" download unsloth/DeepSeek-R1-Distill-Qwen-7B-GGUF DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf --local-dir "$MODELS_DIR"
        ;;
    3)
        echo "⏳ جاري تحميل Llama 3.2 3B Instruct GGUF..."
        "$HF_BIN" download bartowski/Llama-3.2-3B-Instruct-GGUF Llama-3.2-3B-Instruct-Q4_K_M.gguf --local-dir "$MODELS_DIR"
        ;;
    4)
        echo ""
        read -p "أدخل معرّف المستودع أو الرابط (مثال: DavidAU/LFM2.5-2.6B-Qwen3.8-Turbo-Brilliance-Power-X12-NEO-MAX-GGUF): " CUSTOM_REPO
        # تنظيف الرابط تلقائياً إذا قام المستخدم بنسخ الرابط كاملاً من المتصفح
        CUSTOM_REPO=$(echo "$CUSTOM_REPO" | sed -e 's|https://huggingface.co/||g' -e 's|http://huggingface.co/||g' -e 's|/tree/main.*||g' -e 's|/blob/main.*||g' -e 's|/$||g' -e 's|^ *||g' -e 's| *$||g')
        
        echo "🔍 فحص ملفات GGUF المتوفرة في المستودع: $CUSTOM_REPO ..."
        SELECTED_FILE=$(./.venv/bin/python -c "
import sys
from huggingface_hub import HfApi
repo = '$CUSTOM_REPO'
api = HfApi()
try:
    files = [f for f in api.list_repo_tree(repo) if f.path.endswith('.gguf')]
    if not files:
        sys.exit(2)
    files.sort(key=lambda x: x.size)
    print('\nقائمة ملفات GGUF المتوفرة في هذا المستودع:', file=sys.stderr)
    for i, f in enumerate(files, 1):
        print(f'  {i}) {f.path} ({f.size / (1024**3):.2f} GB)', file=sys.stderr)
    print(f'  0) إلغاء', file=sys.stderr)
    sys.stderr.write('\nاختر رقم الملف المراد تحميله: ')
    sys.stderr.flush()
    choice = input().strip()
    idx = int(choice) - 1
    if idx < 0 or idx >= len(files):
        sys.exit(1)
    print(files[idx].path)
except Exception as e:
    print('ERROR:' + str(e), file=sys.stderr)
    sys.exit(3)
")

        if [ $? -eq 0 ] && [ -n "$SELECTED_FILE" ]; then
            echo "🚀 جاري تحميل الملف المختار: $SELECTED_FILE"
            "$HF_BIN" download "$CUSTOM_REPO" "$SELECTED_FILE" --local-dir "$MODELS_DIR"
        else
            echo "❌ تم إلغاء العملية أو لم يتم العثور على ملفات GGUF صالحة في المستودع."
            exit 1
        fi
        ;;
    *)
        echo "تم الإلغاء."
        exit 0
        ;;
esac

echo ""
echo "=========================================================="
echo "✅ تم اكتمال التحميل بنجاح في: $MODELS_DIR"
echo "💡 يمكنك الآن فتح واجهة التطبيق واختيار '📁 نماذج محلية (GGUF)'"
echo "   ثم الضغط على '🔄 فحص المجلد' لتظهر في القائمة فوراً!"
echo "=========================================================="
