#!/usr/bin/env python3
"""
منظومة المجتهد - سكربت التهيئة والتنصيب الآلي على خوادم السحاب وCoolify
يقوم بجلب وتثبيت:
1. سنابشوت متجهات الشاملة (172 GB) واستعادتها آلياً في Qdrant ثم تنظيف الملف المؤرشف لتوفير المساحة
2. قاعدة بيانات نصوص الشاملة الكاملة (40 قسماً) من HuggingFace (AuthenticIlm/Shamela4_Full_DB)
3. نموذج التضمين الشرعي (cs95/almojtahed-qwen3-8b)
4. نموذج الريرانكر المتخصص (cs95/almojtahed-reranker-8b)
"""

import os
import sys
import time
import shutil
import urllib.request
from pathlib import Path
from dotenv import load_dotenv

# تحميل متغيرات البيئة
ROOT_DIR = Path(__file__).resolve().parent
load_dotenv(ROOT_DIR / ".env")

QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))
COLLECTION_NAME = "shamela_almojtahed_8b_dense"

# روابط Hugging Face
SNAPSHOT_REPO = "cs95/shamela-full-7m-qdrant"
SNAPSHOT_FILENAME = "shamela_almojtahed_8b_dense-2735741993374707-2026-10-15-02-17-32.snapshot"
SHAMELA_DB_REPO = "AuthenticIlm/Shamela4_Full_DB"
EMBEDDING_MODEL_REPO = "cs95/almojtahed-qwen3-8b"
RERANKER_MODEL_REPO = "cs95/almojtahed-reranker-8b"

def print_banner(msg):
    print("\n" + "=" * 75)
    print(f"🚀 {msg}")
    print("=" * 75)

def wait_for_qdrant(timeout=60):
    """الانتظار حتى يبدأ خادم Qdrant بالاستجابة"""
    print(f"📡 فحص الاتصال بخدمة Qdrant على {QDRANT_HOST}:{QDRANT_PORT}...")
    start = time.time()
    while time.time() - start < timeout:
        try:
            from qdrant_client import QdrantClient
            client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT, timeout=5)
            client.get_collections()
            print("✅ تم الاتصال بمحرك Qdrant بنجاح!")
            return client
        except Exception:
            time.sleep(2)
    print(f"⚠️ تعذر الاتصال بـ Qdrant بعد {timeout} ثانية. تأكد من تشغيل الخدمة.")
    return None

def init_qdrant_snapshot(client):
    """فحص واستعادة لقطة المتجهات في Qdrant"""
    print_banner("1. فحص مخزن متجهات الشاملة (Qdrant Vector Database)")
    if not client:
        print("⏭️ تم تخطي فحص Qdrant لعدم توفر الاتصال حالياً.")
        return

    try:
        collections = [c.name for c in client.get_collections().collections]
        if COLLECTION_NAME in collections:
            info = client.get_collection(COLLECTION_NAME)
            if info.points_count and info.points_count > 1000:
                print(f"✅ مجموعة الشاملة «{COLLECTION_NAME}» جاهزة ونشطة بالفعل! (عدد المتجهات: {info.points_count:,})")
                return
            else:
                print(f"⚠️ المجموعة موجودة ولكن فارغة، سيتم استعادة السنابشوت...")
        else:
            print(f"🔍 المجموعة «{COLLECTION_NAME}» غير موجودة في Qdrant. جاري التجهيز للاستعادة...")

        # مجلد التحميل المؤقت
        snapshots_dir = ROOT_DIR / "qdrant_service" / "snapshots"
        snapshots_dir.mkdir(parents=True, exist_ok=True)
        local_snapshot_path = snapshots_dir / SNAPSHOT_FILENAME

        if not local_snapshot_path.exists():
            print(f"📥 جاري سحب ملف السنابشوت من Hugging Face ({SNAPSHOT_REPO})...")
            print("💡 حجم السنابشوت حوالي 171 جيجابايت، يرجى الانتظار حسب سرعة الخادم...")
            
            try:
                from huggingface_hub import hf_hub_download
                token = os.getenv("HF_TOKEN") or None
                downloaded_file = hf_hub_download(
                    repo_id=SNAPSHOT_REPO,
                    filename=SNAPSHOT_FILENAME,
                    repo_type="dataset",
                    local_dir=str(snapshots_dir),
                    token=token
                )
                local_snapshot_path = Path(downloaded_file)
            except Exception as hf_err:
                print(f"⚠️ فشل التحميل عبر huggingface_hub: {hf_err}")
                print("🔄 جاري محاولة التحميل المباشر عبر الرابط المباشر...")
                direct_url = f"https://huggingface.co/datasets/{SNAPSHOT_REPO}/resolve/main/{SNAPSHOT_FILENAME}"
                import subprocess
                subprocess.run(["curl", "-L", "-C", "-", "-o", str(local_snapshot_path), direct_url], check=True)

        if local_snapshot_path.exists():
            print(f"📦 تم التحقق من وجود ملف السنابشوت: {local_snapshot_path.stat().st_size / (1024**3):.2f} GB")
            print(f"⏳ بدء تركيب واستعادة السنابشوت داخل محرك Qdrant...")
            
            # استعادة السنابشوت عبر Qdrant Client API
            snapshot_uri = f"file://{local_snapshot_path.resolve()}"
            client.recover_snapshot(
                collection_name=COLLECTION_NAME,
                location=snapshot_uri,
                priority="snapshot"
            )
            print("✅ تم استعادة وتركيب السنابشوت في Qdrant بنجاح تام!")
            
            # حذف ملف السنابشوت بعد تركيبه لتوفير 171 جيجابايت فوراً
            print("🧹 جاري حذف ملف السنابشوت المؤرشف لتوفير 171 جيجابايت مساحة تخزين...")
            try:
                local_snapshot_path.unlink()
                print("✨ تم توفير المساحة بنجاح وبقيت قاعدة البيانات الحية في Qdrant!")
            except Exception as e:
                print(f"تنبيه: تعذر حذف الملف تلقائياً: {e}")

    except Exception as ex:
        print(f"❌ خطأ أثناء استعادة سنابشوت Qdrant: {ex}")

def init_shamela_databases():
    """فحص وسحب قاعدة نصوص الشاملة الكاملة"""
    print_banner("2. فحص نصوص كتب الشاملة الكاملة (Shamela4 SQLite DBs)")
    shamela_dir = ROOT_DIR / "shamela4_data"
    shamela_dir.mkdir(parents=True, exist_ok=True)

    # فحص هل المجلد يحتوي على ملفات كتب
    db_files = list(shamela_dir.glob("*/*.sqlite")) + list(shamela_dir.glob("*/*.db"))
    if len(db_files) > 100:
        print(f"✅ مكتبة الشاملة مثبتة وموجودة بالفعل! ({len(db_files)} كتاباً تراثياً).")
        return

    print(f"📥 جاري سحب كتب الشاملة الـ 8,589 في 40 قسماً من: {SHAMELA_DB_REPO}...")
    try:
        from huggingface_hub import snapshot_download
        token = os.getenv("HF_TOKEN") or None
        snapshot_download(
            repo_id=SHAMELA_DB_REPO,
            repo_type="dataset",
            local_dir=str(shamela_dir),
            token=token,
            max_workers=8
        )
        print("✅ تم اكتمال تحميل نصوص كتب الشاملة بنجاح!")
    except Exception as ex:
        print(f"⚠️ تعذر سحب قاعدة كتب الشاملة: {ex}")

def init_ai_models():
    """فحص وسحب نماذج التضمين وإعادة الترتيب"""
    print_banner("3. فحص نماذج الذكاء الاصطناعي (Embedding & Reranker Models)")
    models_dir = ROOT_DIR / "models"
    models_dir.mkdir(parents=True, exist_ok=True)

    # 1. نموذج التضمين الشرعي
    emb_dir = models_dir / "embedding"
    if (emb_dir / "config.json").exists() or (models_dir / "gguf" / "almojtahed-embedding-8b-Q4_K_M.gguf").exists():
        print("✅ نموذج التضمين الشرعي (Embedding) موجود وجاهز.")
    else:
        print(f"📥 جاري سحب نموذج التضمين من: {EMBEDDING_MODEL_REPO}...")
        try:
            from huggingface_hub import snapshot_download
            token = os.getenv("HF_TOKEN") or None
            snapshot_download(
                repo_id=EMBEDDING_MODEL_REPO,
                local_dir=str(emb_dir),
                token=token
            )
            print("✅ تم سحب نموذج التضمين بنجاح.")
        except Exception as e:
            print(f"⚠️ تعذر سحب نموذج التضمين: {e}")

    # 2. نموذج الريرانكر الشرعي
    rerank_dir = models_dir / "reranker"
    if (rerank_dir / "config.json").exists() or (models_dir / "gguf" / "almojtahed-reranker-8b-Q4_K_M.gguf").exists():
        print("✅ نموذج الريرانكر المتخصص (Reranker) موجود وجاهز.")
    else:
        print(f"📥 جاري سحب نموذج الريرانكر من: {RERANKER_MODEL_REPO}...")
        try:
            from huggingface_hub import snapshot_download
            token = os.getenv("HF_TOKEN") or None
            snapshot_download(
                repo_id=RERANKER_MODEL_REPO,
                local_dir=str(rerank_dir),
                token=token
            )
            print("✅ تم سحب نموذج الريرانكر بنجاح.")
        except Exception as e:
            print(f"⚠️ تعذر سحب نموذج الريرانكر: {e}")

def main():
    print("=" * 75)
    print("🌟 بدء فحص وتهيئة بيانات منصة المجتهد السحابية (Coolify Init Engine)")
    print("=" * 75)
    
    q_client = wait_for_qdrant(timeout=45)
    init_qdrant_snapshot(q_client)
    init_shamela_databases()
    init_ai_models()
    
    print("\n" + "=" * 75)
    print("🎉 اكتمل فحص وتجهيز كافة البيانات المطلوبة للمنظومة!")
    print("=" * 75)

if __name__ == "__main__":
    main()
