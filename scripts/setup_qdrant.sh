#!/bin/bash
# ==============================================================================
# 🚀 سكريبت شامل لتثبيت Qdrant وسحب واستعادة قاعدة بيانات المجتهد / الشاملة
# ==============================================================================
# الاستخدام:
#   bash scripts/setup_qdrant.sh
# أو عبر أمر واحد مباشر من أي مكان:
#   curl -sSL https://raw.githubusercontent.com/awdasd1/almojtahed/main/scripts/setup_qdrant.sh | bash
# ==============================================================================

set -e

# ألوان التنسيق
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}================================================================${NC}"
echo -e "${CYAN}📚 سكريبت تثبيت Qdrant واستعادة قاعدة بيانات الشاملة والمجتهد${NC}"
echo -e "${CYAN}================================================================${NC}"

# إعداد المتغيرات
QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"
COLLECTION_NAME="${COLLECTION_NAME:-badr_all_tsh_corpus}"
SNAPSHOT_NAME="badr_all_tsh_colc.snapshot"
HF_DATASET_URL="https://huggingface.co/datasets/cs95/almojtahed/resolve/main/${SNAPSHOT_NAME}"
DATA_DIR="${HOME}/qdrant_storage"
SNAPSHOTS_DIR="${HOME}/qdrant_snapshots"

mkdir -p "$DATA_DIR" "$SNAPSHOTS_DIR"

# ------------------------------------------------------------------------------
# 1. التحقق من تشغيل محرك Qdrant أو إطلاقه عبر دوكر
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[1/4] فحص حالة محرك Qdrant...${NC}"
if curl -s "${QDRANT_URL}/readyz" >/dev/null 2>&1 || curl -s "${QDRANT_URL}/healthz" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ محرك Qdrant يعمل ومتصل بالفعل على: ${QDRANT_URL}${NC}"
else
    if command -v docker >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️ Qdrant غير مشغل، جاري إطلاقه تلقائياً عبر Docker...${NC}"
        
        # إيقاف أي حاوية قديمة متوقفة بنفس الاسم
        docker rm -f qdrant 2>/dev/null || true

        docker run -d \
            --name qdrant \
            --restart always \
            -p 6333:6333 \
            -p 6334:6334 \
            -v "${DATA_DIR}:/qdrant/storage:z" \
            -v "${SNAPSHOTS_DIR}:/qdrant/snapshots:z" \
            qdrant/qdrant:latest

        echo -e "${CYAN}⏳ في انتظار جاهزية Qdrant...${NC}"
        RETRY=0
        until curl -s "http://localhost:6333/readyz" >/dev/null 2>&1 || [ $RETRY -ge 30 ]; do
            sleep 2
            RETRY=$((RETRY+1))
        done

        if [ $RETRY -ge 30 ]; then
            echo -e "${RED}❌ فشل إقلاع Qdrant في الوقت المحدد.${NC}"
            exit 1
        fi
        echo -e "${GREEN}✅ تم تشغيل Qdrant بنجاح على المنفذ 6333!${NC}"
    else
        echo -e "${RED}❌ Docker غير مثبت و Qdrant لا يستجيب على ${QDRANT_URL}!${NC}"
        echo -e "${YELLOW}يرجى تشغيل Qdrant أولاً أو تثبيت Docker على السيرفر.${NC}"
        exit 1
    fi
fi

# ------------------------------------------------------------------------------
# 2. تحميل ملف السنابشوت من Hugging Face
# ------------------------------------------------------------------------------
TARGET_FILE="${SNAPSHOTS_DIR}/${SNAPSHOT_NAME}"
echo -e "\n${YELLOW}[2/4] فحص وتحميل ملف السنابشوت من Hugging Face...${NC}"

if [ -f "$TARGET_FILE" ] && [ $(stat -f%z "$TARGET_FILE" 2>/dev/null || stat -c%s "$TARGET_FILE" 2>/dev/null || echo 0) -gt 1000000000 ]; then
    echo -e "${GREEN}✅ ملف السنابشوت موجود محلياً بالفعل: ${TARGET_FILE}${NC}"
else
    echo -e "${CYAN}📥 جاري سحب السنابشوت من: ${HF_DATASET_URL}${NC}"
    echo -e "${CYAN}💡 يدعم الاستئناف التلقائي في حال انقطاع التحميل...${NC}"

    HF_HEADER=""
    if [ -n "$HF_TOKEN" ]; then
        HF_HEADER="--header=Authorization: Bearer ${HF_TOKEN}"
    fi

    if command -v wget >/dev/null 2>&1; then
        wget -c $HF_HEADER "$HF_DATASET_URL" -O "$TARGET_FILE"
    elif command -v curl >/dev/null 2>&1; then
        CURL_AUTH=""
        [ -n "$HF_TOKEN" ] && CURL_AUTH="-H Authorization: Bearer ${HF_TOKEN}"
        curl -C - -L $CURL_AUTH "$HF_DATASET_URL" -o "$TARGET_FILE"
    else
        echo -e "${RED}❌ لم يتم العثور على curl أو wget لتحميل الملف!${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ اكتمل تحميل ملف السنابشوت بنجاح!${NC}"
fi

# ------------------------------------------------------------------------------
# 3. استعادة السنابشوت داخل Qdrant عبر API
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[3/4] جاري استعادة السنابشوت داخل Qdrant (المجموعة: ${COLLECTION_NAME})...${NC}"

# نحدد المسار الداخلي للسنابشوت داخل حاوية Qdrant
INTERNAL_SNAPSHOT_PATH="file:///qdrant/snapshots/${SNAPSHOT_NAME}"

RECOVER_RESP=$(curl -s -X PUT "${QDRANT_URL}/collections/${COLLECTION_NAME}/snapshots/recover" \
    -H "Content-Type: application/json" \
    -d "{\"location\": \"${INTERNAL_SNAPSHOT_PATH}\"}" || true)

echo -e "استجابة Qdrant: ${RECOVER_RESP}"

# استعادة نسخة أيضاً تحت shamela_corpus إن رغبت
if [ "${COLLECTION_NAME}" != "shamela_corpus" ]; then
    echo -e "\n${YELLOW}ربط واستعادة المجموعة أيضاً كـ 'shamela_corpus'...${NC}"
    curl -s -X PUT "${QDRANT_URL}/collections/shamela_corpus/snapshots/recover" \
        -H "Content-Type: application/json" \
        -d "{\"location\": \"${INTERNAL_SNAPSHOT_PATH}\"}" >/dev/null 2>&1 || true
fi

# ------------------------------------------------------------------------------
# 4. التحقق والتقرير النهائي
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[4/4] التحقق من اكتمال استعادة الفهرس...${NC}"
sleep 3

INFO_RESP=$(curl -s "${QDRANT_URL}/collections/${COLLECTION_NAME}" || true)
POINTS=$(echo "$INFO_RESP" | grep -o '"points_count":[0-9]*' | cut -d':' -f2 || echo "غير معروف")

echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}🎉 تم استعادة قاعدة البيانات والمتجهات بنجاح!${NC}"
echo -e "${CYAN}📍 اسم المجموعة: ${COLLECTION_NAME}${NC}"
echo -e "${CYAN}📊 عدد النقاط المفهرسة: ${POINTS}${NC}"
echo -e "${CYAN}🌐 لوحة تحكم Qdrant متاحة على: ${QDRANT_URL}/dashboard${NC}"
echo -e "${GREEN}================================================================${NC}"
