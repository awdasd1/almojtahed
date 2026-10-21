#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
shamela_local_mcp.py - خادم بروتوكول MCP الداخلي لمنظومة المجتهد
=============================================================================
الوظيفة: توفير أدوات التحقيق والمطالعة الموضعية لنصوص الشاملة التراثية الأصلية:
  1. get_page_range: تقليب وقراءة صفحات متسلسلة كاملة بنصها وهوامشها وتخريجها.
  2. get_book_toc: استخراج شجرة الأبواب وفهرس المحتويات للكتاب.
  3. verify_quote: مطابقة نص الاقتباس الحرفي داخل صفحات الكتاب بدقة تامة.
  4. search_in_book: بحث حرفي سريع ومحصور داخل نطاق كتاب واحد.
=============================================================================
"""

import os
import sys
import json
import re
from pathlib import Path
from typing import Dict, List, Any, Optional

SYSTEM_ROOT = Path(__file__).resolve().parent.parent
WORKSPACE_ROOT = SYSTEM_ROOT.parent

# تحديد مسار نصوص الشاملة الكاملة
if (SYSTEM_ROOT / "shamela4_data").exists():
    SHAMELA_DATA_DIR = SYSTEM_ROOT / "shamela4_data"
else:
    SHAMELA_DATA_DIR = Path(os.getenv("SHAMELA4_DATA_DIR", str(WORKSPACE_ROOT / "shamela4_data")))

# ذاكرة تخزين مؤقت لفهارس صفحات الكتب لتسريع التصفح المتكرر
_BOOK_INDEX_CACHE: Dict[str, Dict[str, Any]] = {}

def clean_arabic_text(text: str) -> str:
    """إزالة وسوم HTML والتشكيل لتسهيل البحث والمطابقة"""
    if not text:
        return ""
    # إزالة وسوم HTML
    t = re.sub(r"<[^>]+>", " ", text)
    # إزالة حركات التشكيل والتطويل
    t = re.sub(r"[\u064B-\u065F\u0670\u0640]", "", t)
    # توحيد الهمزات والألف والياء
    t = re.sub(r"[إأآا]", "ا", t)
    t = re.sub(r"[ىي]", "ي", t)
    t = re.sub(r"ة", "ه", t)
    return " ".join(t.split())

import sqlite3

# مسار قاعدة بيانات الفهرس المحلي المدمج
if (SYSTEM_ROOT / "shamela_index.db").exists():
    DB_PATH = SYSTEM_ROOT / "shamela_index.db"
elif (Path(__file__).resolve().parent / "shamela_index.db").exists():
    DB_PATH = Path(__file__).resolve().parent / "shamela_index.db"
elif Path("/Users/maa/Shamela Snapshot/shamela_index.db").exists():
    DB_PATH = Path("/Users/maa/Shamela Snapshot/shamela_index.db")
else:
    DB_PATH = SYSTEM_ROOT / "shamela_index.db"

def resolve_book_files(book_id_or_title: Any) -> Optional[Path]:
    """العثور على مجلد الكتاب بدقة متناهية عبر SQLite وفهارس الشاملة"""
    if not SHAMELA_DATA_DIR.exists():
        return None

    str_val = str(book_id_or_title).strip()
    
    # 1. فحص قاعدة بيانات SQLite الرسمية
    if DB_PATH.exists():
        try:
            conn = sqlite3.connect(str(DB_PATH), timeout=5)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # بحث برقم الشاملة
            clean_id = re.sub(r"^\D*", "", str_val)
            if clean_id:
                cursor.execute("SELECT rel_path FROM books WHERE book_id = ? OR rel_path LIKE ? LIMIT 1", 
                               (clean_id, f"%/{clean_id}__%"))
                row = cursor.fetchone()
                if row and row["rel_path"]:
                    clean_rel = row["rel_path"].replace("shamela4_data/", "").strip("/")
                    p = SHAMELA_DATA_DIR / clean_rel
                    if p.exists():
                        conn.close()
                        return p

            # بحث ذكي بالاسم والمؤلف مع ترتيب الأولوية وحجم المجلدات
            q_clean = re.sub(r"^(?:كتاب|شرح|مختصر|متن|كتاب\s+شرح)\s+", "", str_val).strip()
            # تجريد لام النسبة في المؤلف (مثل 'لابن قدامة' -> 'ابن قدامة'، 'للبخاري' -> 'البخاري')
            q_author_clean = re.sub(r"\bل(ابن|ل?[أ-ي])", r"\1", q_clean)
            words = q_author_clean.split()
            title_candidate = words[0] if words else q_clean
            author_candidate = words[-1] if len(words) > 1 else ""

            # 1. فحص التطابق الدقيق أولاً
            cursor.execute("SELECT rel_path FROM books WHERE title_ar = ? LIMIT 1", (str_val,))
            row = cursor.fetchone()
            if not row and q_clean != str_val:
                cursor.execute("SELECT rel_path FROM books WHERE title_ar = ? LIMIT 1", (q_clean,))
                row = cursor.fetchone()

            # 2. فحص مرجح ذكي يبحث بالعنوان والمؤلف ويرتب بالأهمية وعدد المجلدات
            if not row:
                cursor.execute("""
                    SELECT rel_path FROM books 
                    WHERE title_ar LIKE ? OR title_ar LIKE ? OR (title_ar LIKE ? AND main_author_name_ar LIKE ?)
                    ORDER BY 
                        (title_ar = ?) DESC,
                        (title_ar LIKE ?) DESC,
                        (main_author_name_ar LIKE ? AND main_author_name_ar != '') DESC,
                        (title_ar LIKE ?) DESC,
                        volume_count_observed DESC
                    LIMIT 1
                """, (
                    f"%{str_val}%",
                    f"%{q_clean}%",
                    f"%{title_candidate}%",
                    f"%{author_candidate}%" if author_candidate else "%",
                    str_val,
                    f"{q_clean}%",
                    f"%{author_candidate}%" if author_candidate else "%",
                    f"%{title_candidate}%"
                ))
                row = cursor.fetchone()

            if not row:
                # محاولة بعد إزالة لواحق التحقيق والطبعة
                simple_title = q_clean.split("-")[0].split("=")[0].strip()
                cursor.execute("SELECT rel_path FROM books WHERE title_ar LIKE ? ORDER BY volume_count_observed DESC LIMIT 1", (f"{simple_title}%",))
                row = cursor.fetchone()
            
            if row and row["rel_path"]:
                clean_rel = row["rel_path"].replace("shamela4_data/", "").strip("/")
                p = SHAMELA_DATA_DIR / clean_rel
                if p.exists():
                    conn.close()
                    return p
            conn.close()
        except Exception:
            pass

    # 2. فحص مباشر لمجلدات shamela4_data
    clean_id = re.sub(r"^\D*", "", str_val)
    if clean_id:
        target_prefix = f"{clean_id}__"
        for cat_dir in SHAMELA_DATA_DIR.iterdir():
            if cat_dir.is_dir() and not cat_dir.name.startswith((".", "_")):
                for b_dir in cat_dir.iterdir():
                    if b_dir.is_dir() and b_dir.name.startswith(target_prefix):
                        return b_dir

    normalized_search = clean_arabic_text(str_val)
    for cat_dir in SHAMELA_DATA_DIR.iterdir():
        if cat_dir.is_dir() and not cat_dir.name.startswith((".", "_")):
            for b_dir in cat_dir.iterdir():
                if b_dir.is_dir():
                    b_clean = clean_arabic_text(b_dir.name)
                    if normalized_search in b_clean or b_clean in normalized_search:
                        return b_dir


    return None

def get_book_index(book_dir: Path) -> Dict[str, Any]:
    """بناء أو جلب فهرس أوفست الصفحات للكتاب لقراءته لحظياً عبر seek"""
    cache_key = str(book_dir)
    if cache_key in _BOOK_INDEX_CACHE:
        return _BOOK_INDEX_CACHE[cache_key]

    pages_file = book_dir / "pages.jsonl"
    if not pages_file.exists():
        return {"entries": [], "meta": {}}

    entries = []
    meta = {}
    meta_file = book_dir / "book_metadata.json"
    if meta_file.exists():
        try:
            with open(meta_file, "r", encoding="utf-8") as f:
                meta = json.load(f)
        except Exception:
            pass

    try:
        with open(pages_file, "rb") as f:
            offset = 0
            seq = 1
            for line in f:
                try:
                    d = json.loads(line.decode("utf-8"))
                    part = str(d.get("volume") or d.get("part") or "").strip()
                    p_num = d.get("page_num")
                    page_id = d.get("page_id")
                    entries.append({
                        "seq": seq,
                        "part": part,
                        "page_num": p_num,
                        "page_id": page_id,
                        "offset": offset
                    })
                    seq += 1
                except Exception:
                    pass
                offset += len(line)
    except Exception as e:
        print(f"Error indexing pages for {book_dir.name}: {e}")

    result = {"entries": entries, "meta": meta, "book_dir": book_dir}
    _BOOK_INDEX_CACHE[cache_key] = result
    return result

# =============================================================================
# أدوات MCP المعيارية (MCP Tool Handlers)
# =============================================================================

def get_page_range(book: Any, start_page: int, end_page: int, part: Optional[str] = None) -> Dict[str, Any]:
    """
    أداة 1: تقليب وقراءة صفحات متسلسلة كاملة بنصها وهوامشها.
    """
    b_dir = resolve_book_files(book)
    if not b_dir:
        return {"error": f"تعذر العثور على ملفات الكتاب: {book}"}

    idx = get_book_index(b_dir)
    entries = idx["entries"]
    if not entries:
        return {"error": "الكتاب لا يحتوي على صفحات صالحة للقراءة."}

    # تصفية الصفحات حسب الجزء ورقم الصفحة
    p_str = str(part).strip() if part and str(part).strip() != "None" else None
    matched_entries = []
    for e in entries:
        if p_str and e["part"] != p_str:
            continue
        p_num = e.get("page_num")
        if p_num is not None:
            try:
                p_int = int(p_num)
                if start_page <= p_int <= end_page:
                    matched_entries.append(e)
            except Exception:
                pass

    if not matched_entries:
        # إذا لم يُعثر عليها برقم الصفحة المطبوعة، نعتمد التسلسل (Seq)
        matched_entries = [e for e in entries if start_page <= e["seq"] <= end_page]

    pages_file = b_dir / "pages.jsonl"
    pages_data = []

    try:
        with open(pages_file, "rb") as f:
            for entry in matched_entries[:50]:  # سقف أقصى 50 صفحة في الطلب الواحد
                f.seek(entry["offset"])
                line = f.readline()
                if line:
                    data = json.loads(line.decode("utf-8"))
                    raw_body = data.get("body", "")
                    clean_b = re.sub(r"<[^>]+>", "", raw_body).strip()
                    footnotes = data.get("footnotes") or ""
                    if footnotes:
                        footnotes = re.sub(r"<[^>]+>", "", footnotes).strip()

                    pages_data.append({
                        "part": entry["part"],
                        "page_num": entry["page_num"],
                        "seq": entry["seq"],
                        "body": clean_b,
                        "footnotes": footnotes
                    })
    except Exception as e:
        return {"error": f"خطأ أثناء قراءة صفحات الكتاب: {e}"}

    distinct_parts = []
    for e in matched_entries:
        pt = str(e.get("part") or "").strip()
        if pt and pt not in distinct_parts:
            distinct_parts.append(pt)

    return {
        "status": "ok",
        "book_title": idx["meta"].get("title_ar") or b_dir.name.split("__")[-1].replace("-", " "),
        "author": idx["meta"].get("main_author_name_ar") or "من أئمة التراث",
        "start_page": start_page,
        "end_page": end_page,
        "part": p_str or (distinct_parts[0] if distinct_parts else "1"),
        "available_parts": distinct_parts,
        "pages_count": len(pages_data),
        "pages": pages_data
    }

def get_book_toc(book: Any) -> Dict[str, Any]:
    """
    أداة 2: استخراج شجرة الأبواب وفهرس المحتويات للكتاب.
    """
    b_dir = resolve_book_files(book)
    if not b_dir:
        return {"error": f"تعذر العثور على ملفات الكتاب: {book}"}

    toc_file = b_dir / "toc.jsonl"
    if not toc_file.exists():
        return {"status": "ok", "message": "لا يتوفر ملف فهرس أبواب منفصل لهذا الكتاب.", "toc": []}

    toc_items = []
    try:
        with open(toc_file, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    item = json.loads(line)
                    toc_items.append({
                        "title": item.get("title_text", ""),
                        "page_id": item.get("page_id"),
                        "shamela_title_id": item.get("shamela_title_id")
                    })
    except Exception as e:
        return {"error": f"فشل قراءة فهرس الكتاب: {e}"}

    meta_file = b_dir / "book_metadata.json"
    title = b_dir.name.split("__")[-1].replace("-", " ")
    if meta_file.exists():
        try:
            with open(meta_file, "r", encoding="utf-8") as f:
                m = json.load(f)
                title = m.get("title_ar") or title
        except Exception:
            pass

    return {
        "status": "ok",
        "book_title": title,
        "total_headings": len(toc_items),
        "toc": toc_items[:400]  # إرجاع أول 400 عنوان وباب رئيسي
    }

def verify_quote(book: Any, quote_text: str, part: Optional[str] = None, page_hint: Optional[int] = None) -> Dict[str, Any]:
    """
    أداة 3: مطابقة نص الاقتباس الحرفي داخل صفحات الكتاب بدقة 100%.
    """
    b_dir = resolve_book_files(book)
    if not b_dir:
        return {"error": f"تعذر العثور على ملفات الكتاب: {book}"}

    idx = get_book_index(b_dir)
    entries = idx["entries"]
    clean_target = clean_arabic_text(quote_text)
    if len(clean_target) < 6:
        return {"error": "النص المراد التحقق منه قصير جداً."}

    pages_file = b_dir / "pages.jsonl"
    
    # تحديد نطاق الفحص: إذا وجد رقم صفحة تقريبي نفحص الصفحات المحيطة أولاً
    scan_entries = entries
    if page_hint is not None:
        near = [e for e in entries if e.get("page_num") and abs(int(e["page_num"]) - page_hint) <= 8]
        if near:
            scan_entries = near + [e for e in entries if e not in near]

    matches = []
    try:
        with open(pages_file, "rb") as f:
            for entry in scan_entries:
                f.seek(entry["offset"])
                line = f.readline()
                if line:
                    data = json.loads(line.decode("utf-8"))
                    body = data.get("body", "")
                    clean_b = clean_arabic_text(body)
                    
                    if clean_target in clean_b:
                        matches.append({
                            "verified": True,
                            "part": entry["part"],
                            "page_num": entry["page_num"],
                            "seq": entry["seq"],
                            "snippet": re.sub(r"<[^>]+>", "", body)[:400]
                        })
                        if len(matches) >= 3:
                            break
    except Exception as e:
        return {"error": f"خطأ أثناء التحقق من الاقتباس: {e}"}

    meta_file = b_dir / "book_metadata.json"
    title = b_dir.name.split("__")[-1].replace("-", " ")
    if meta_file.exists():
        try:
            with open(meta_file, "r", encoding="utf-8") as mf:
                m = json.load(mf)
                title = m.get("title_ar") or title
        except Exception:
            pass

    clean_rel = str(b_dir.relative_to(SHAMELA_DATA_DIR))
    return {
        "status": "ok",
        "book_title": title,
        "rel_path": clean_rel,
        "verified": len(matches) > 0,
        "matches_count": len(matches),
        "matches": matches,
        "quote_checked": quote_text
    }

def search_in_book(book: Any, query: str, limit: int = 10) -> Dict[str, Any]:
    """
    أداة 4: بحث حرفي سريع ومحصور داخل نطاق كتاب واحد.
    """
    b_dir = resolve_book_files(book)
    if not b_dir:
        return {"error": f"تعذر العثور على ملفات الكتاب: {book}"}

    idx = get_book_index(b_dir)
    entries = idx["entries"]
    clean_q = clean_arabic_text(query)
    q_words = clean_q.split()

    pages_file = b_dir / "pages.jsonl"
    hits = []

    try:
        with open(pages_file, "rb") as f:
            for entry in entries:
                f.seek(entry["offset"])
                line = f.readline()
                if line:
                    data = json.loads(line.decode("utf-8"))
                    body = data.get("body", "")
                    clean_b = clean_arabic_text(body)

                    if clean_q in clean_b or (len(q_words) > 1 and all(w in clean_b for w in q_words)):
                        clean_plain = re.sub(r"<[^>]+>", " ", body)
                        hits.append({
                            "part": entry["part"],
                            "page_num": entry["page_num"],
                            "seq": entry["seq"],
                            "snippet": clean_plain[:350]
                        })
                        if len(hits) >= limit:
                            break
    except Exception as e:
        return {"error": f"فشل البحث داخل الكتاب: {e}"}

    return {
        "status": "ok",
        "book_title": idx["meta"].get("title_ar") or b_dir.name.split("__")[-1].replace("-", " "),
        "query": query,
        "results_count": len(hits),
        "results": hits
    }

# =============================================================================
# مواصفات أدوات MCP لتمريرها للنماذج الذكية (MCP Tools Catalog Schema)
# =============================================================================

SHAMELA_MCP_TOOLS_SPEC = [
    {
        "type": "function",
        "function": {
            "name": "get_page_range",
            "description": "قراءة وتقليب صفحات متتالية كاملة من أي كتاب في الشاملة بنصها الأصلي وهوامش التحقيق (تستعمل عند الحاجة لقراءة سياق المسألة كاملاً أو باب بأكمله).",
            "parameters": {
                "type": "object",
                "properties": {
                    "book": {"type": "string", "description": "اسم الكتاب أو رقمه في الشاملة (مثال: '2437' أو 'المغني لابن قدامة')"},
                    "start_page": {"type": "integer", "description": "رقم بداية الصفحة"},
                    "end_page": {"type": "integer", "description": "رقم نهاية الصفحة"},
                    "part": {"type": "string", "description": "رقم أو اسم الجزء (اختياري، مثال: '3')"}
                },
                "required": ["book", "start_page", "end_page"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_book_toc",
            "description": "استعراض شجرة الأبواب وفهرس المحتويات للكتاب لمعرفة مواضع الأبواب والفصول وتوزيع المسائل.",
            "parameters": {
                "type": "object",
                "properties": {
                    "book": {"type": "string", "description": "اسم الكتاب أو رقمه المعياري في الشاملة"}
                },
                "required": ["book"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "verify_quote",
            "description": "مطابقة نص الاقتباس الحرفي داخل صفحات الكتاب والتأكد من وروده بنصه دون أي تصرف أو اختلاق من النموذج.",
            "parameters": {
                "type": "object",
                "properties": {
                    "book": {"type": "string", "description": "اسم الكتاب أو رقمه"},
                    "quote_text": {"type": "string", "description": "النص التراثي المراد التحقق من وجوده حرفياً"},
                    "page_hint": {"type": "integer", "description": "رقم الصفحة التقريبي إن وجد لتسريع التحقق"}
                },
                "required": ["book", "quote_text"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_in_book",
            "description": "بحث حرفي سريع ومحصور داخل نطاق كتاب واحد محدد فقط للوقوف على كلمة أو عبارة معينة.",
            "parameters": {
                "type": "object",
                "properties": {
                    "book": {"type": "string", "description": "اسم الكتاب أو رقمه"},
                    "query": {"type": "string", "description": "الكلمة أو العبارة المراد البحث عنها داخل هذا الكتاب"},
                    "limit": {"type": "integer", "description": "أقصى عدد للنتائج (افتراضياً 10)"}
                },
                "required": ["book", "query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_surrounding_context",
            "description": "تقليب الصفحات السابقة واللاحقة (استيفاء السياق المحيط) لصفحة معينة في كتاب لكشف رأس الحولية التاريخية أو مطلع المسألة الفقهية الحاكمة.",
            "parameters": {
                "type": "object",
                "properties": {
                    "book": {"type": "string", "description": "اسم الكتاب أو رقمه"},
                    "page_num": {"type": "integer", "description": "رقم الصفحة المراد استيفاء سياقها"},
                    "part": {"type": "string", "description": "رقم الجزء إن وجد"},
                    "before_pages": {"type": "integer", "description": "عدد الصفحات السابقة (افتراضياً 2)"},
                    "after_pages": {"type": "integer", "description": "عدد الصفحات اللاحقة (افتراضياً 2)"}
                },
                "required": ["book", "page_num"]
            }
        }
    }
]

def get_surrounding_context(book: Any, page_num: int, part: Optional[str] = None, before_pages: int = 2, after_pages: int = 2) -> Dict[str, Any]:
    """تقليب واستيفاء الصفحات السابقة واللاحقة لكشف سياق المسألة أو الحولية"""
    p_int = max(1, int(page_num or 1))
    b_int = max(0, min(int(before_pages or 2), 5))
    a_int = max(0, min(int(after_pages or 2), 5))
    start_p = max(1, p_int - b_int)
    end_p = p_int + a_int
    return get_page_range(book=book, start_page=start_p, end_page=end_p, part=part)

def execute_mcp_tool(name: str, args: Dict[str, Any]) -> Dict[str, Any]:
    """الموجّه التنفيذي الموحد لاستدعاء أدوات الـ MCP"""
    if name == "get_page_range":
        return get_page_range(
            book=args.get("book"),
            start_page=int(args.get("start_page", 1)),
            end_page=int(args.get("end_page", 5)),
            part=args.get("part")
        )
    elif name == "get_surrounding_context":
        return get_surrounding_context(
            book=args.get("book"),
            page_num=int(args.get("page_num", 1)),
            part=args.get("part"),
            before_pages=int(args.get("before_pages", 2)),
            after_pages=int(args.get("after_pages", 2))
        )
    elif name == "get_book_toc":
        return get_book_toc(book=args.get("book"))
    elif name == "verify_quote":
        return verify_quote(
            book=args.get("book"),
            quote_text=args.get("quote_text", ""),
            page_hint=args.get("page_hint")
        )
    elif name == "search_in_book":
        return search_in_book(
            book=args.get("book"),
            query=args.get("query", ""),
            limit=int(args.get("limit", 10))
        )
    else:
        return {"error": f"أداة غير معروفة: {name}"}

if __name__ == "__main__":
    # اختبار سريع ومباشر للأدوات
    print("--- اختبار أداة تقليب الصفحات get_page_range في المغني ---")
    res1 = get_page_range(book="2437", start_page=15, end_page=16, part="1")
    print("Book:", res1.get("book_title"), "| Author:", res1.get("author"))
    print("Pages retrieved:", len(res1.get("pages", [])))
    if res1.get("pages"):
        print("Page 1 snippet:", res1["pages"][0]["body"][:120])

    print("\n--- اختبار أداة جلب فهرس الأبواب get_book_toc ---")
    res2 = get_book_toc(book="2437")
    print("Total headings:", res2.get("total_headings"))
    if res2.get("toc"):
        print("Sample heading:", res2["toc"][0])
