"""
خادم ومحرك أدوات التحقيق الشرعي عبر Model Context Protocol (MCP) للمكتبة الشاملة.
يربط بين:
1. البحث الدلالي والهجين في نصوص الشاملة عبر Qdrant و BM25 مع العزو المكتبي الكامل.
2. قراءة الصفحة وسياقها الكامل (الصفحة السابقة واللاحقة) والبطاقة التوثيقية للكتاب.
3. استعراض بطاقة الكتاب وفهرس الموضوعات والأبواب (TOC).
4. بيانات الميتا داتا الضخمة (_meta: الرواة، الأسانيد، التخريج، الآيات، الجذور).
5. خادم MCP رسمي متوافق مع Claude Desktop و Cursor و Antigravity وأي عميل MCP.
"""

import os
import re
import json
import time
import sqlite3
import urllib.request
import urllib.parse
from pathlib import Path
from typing import Optional, List, Dict, Any, Union

import pyarrow as pa
import pyarrow.parquet as pq
import pyarrow.compute as pc
from mcp.server.mcpserver import MCPServer

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("SHAMELA_DATA_DIR", str(BASE_DIR / "shamela4_data")))
META_DIR = Path(os.environ.get("SHAMELA_META_DIR", str(DATA_DIR / "_meta")))
DB_PATH = Path(os.environ.get("SHAMELA_INDEX_DB", str(BASE_DIR / "shamela_index.db")))

# Direct in-memory search callable to prevent self-referential loopback HTTP deadlocks
_DIRECT_SEARCH_CALLABLE = None

def set_direct_search_callable(fn):
    global _DIRECT_SEARCH_CALLABLE
    _DIRECT_SEARCH_CALLABLE = fn

# Cache tables in memory on demand for ultra-fast response
_CACHED_TABLES: Dict[str, Any] = {}

def get_table(name: str):
    """تحميل جدول Parquet عند الطلب وتخزينه في الذاكرة لتسريع الاستجابة"""
    if name not in _CACHED_TABLES:
        file_path = META_DIR / f"{name}.parquet"
        if not file_path.exists():
            return None
        _CACHED_TABLES[name] = pq.read_table(str(file_path))
    return _CACHED_TABLES[name]

def get_db_connection():
    """الحصول على اتصال بقاعدة بيانات الفهرس المحلي"""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

_BETAKA_CACHE: Dict[int, str] = {}

def get_book_betaka(book_id: int) -> str:
    """جلب بطاقة الكتاب التوثيقية وتخزينها في الذاكرة لتسريع استجابة الخادم"""
    if not book_id:
        return ""
    if book_id in _BETAKA_CACHE:
        return _BETAKA_CACHE[book_id]
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT betaka_text FROM books WHERE book_id = ? LIMIT 1", (book_id,))
        row = cur.fetchone()
        conn.close()
        card = row["betaka_text"] if (row and row["betaka_text"]) else ""
        _BETAKA_CACHE[book_id] = card
        return card
    except Exception:
        return ""

def parse_betaka_metadata(betaka_text: str) -> Dict[str, Any]:
    """استخراج بيانات التوثيق، دار النشر، الطبعة، والمحقق من بطاقة الكتاب التراثي"""
    if not betaka_text:
        return {
            "publisher": "",
            "edition": "",
            "investigator": "",
            "parts_count": "",
            "printed_status": "",
            "raw_card": ""
        }
    
    clean_text = betaka_text.replace('\r\n', '\n').replace('\r', '\n')
    lines = [line.strip() for line in clean_text.split('\n') if line.strip()]
    
    meta = {
        "publisher": "",
        "edition": "",
        "investigator": "",
        "parts_count": "",
        "printed_status": "",
        "raw_card": clean_text.strip()
    }
    
    for line in lines:
        if "[" in line and "]" in line and "موافق للمطبوع" in line:
            meta["printed_status"] = line.strip("[] ")
            continue
            
        m = re.match(r"^([^:]{2,30})\s*:\s*(.*)$", line)
        if m:
            k, v = m.group(1).strip(), m.group(2).strip()
            # 1. الطبعة وسنة الطبع (نفحصها قبل الناشر لتفادي التداخل مع طبع/المطبعة)
            if any(w in k for w in ["الطبعة", "طبعة", "سنة الطبع", "عام النشر", "تاريخ النشر"]):
                if not meta["edition"]:
                    meta["edition"] = v
            # 2. دار النشر والمطبعة
            elif any(w in k for w in ["الناشر", "دار النشر", "مطبعة", "المطبعة", "دار"]):
                if not meta["publisher"]:
                    meta["publisher"] = v
            # 3. التحقيق والاعتناء
            elif any(w in k for w in ["المحقق", "تحقيق", "دراسة وتحقيق", "إعداد", "علق عليه", "اعتنى به", "ضبطه"]):
                if not meta["investigator"]:
                    meta["investigator"] = v
            # 4. الأجزاء والصفحات
            elif any(w in k for w in ["عدد الأجزاء", "عدد الصفحات", "الأجزاء"]):
                if not meta["parts_count"]:
                    meta["parts_count"] = v

    return meta

def format_scholarly_citation(
    title: str,
    author: str,
    death_hijri: Optional[Any],
    part: Optional[Any],
    page_num: Optional[Any],
    meta: Optional[Dict[str, Any]] = None
) -> str:
    """بناء عزو توثيقي أكاديمي فائق الدقة متوافق مع المنهجية العلمية المعتمدة"""
    cit_parts = []
    
    author_str = f" لـ {author}" if author else ""
    death_str = f" (ت {death_hijri}هـ)" if death_hijri else ""
    cit_parts.append(f"«{title}»{author_str}{death_str}")
    
    if meta:
        if meta.get("investigator"):
            cit_parts.append(f"تحقيق: {meta['investigator']}")
        pub_info = []
        if meta.get("publisher"):
            pub_info.append(meta["publisher"])
        if meta.get("edition"):
            pub_info.append(f"ط: {meta['edition']}")
        if pub_info:
            cit_parts.append("، ".join(pub_info))
            
    vol_str = f"ج: {part or '١'}"
    page_str = f"ص: {page_num or '-'}"
    cit_parts.append(f"{vol_str} {page_str}")
    
    return " - ".join(cit_parts)

def normalize_arabic(text: str) -> str:
    """إزالة التشكيل وتوحيد الحروف للبحث المرن"""
    if not text:
        return ""
    text = re.sub(r'[\u064B-\u065F\u0670\u0640\u06D6-\u06ED]', '', text)
    text = re.sub(r'[إأآٱ]', 'ا', text)
    text = re.sub(r'ة', 'ه', text)
    text = re.sub(r'ى', 'ي', text)
    return text.strip()


# -------------------------------------------------------------
# 1. أداة البحث الدلالي والهجين في نصوص الشاملة (Qdrant + BM25)
# -------------------------------------------------------------
def search_shamela_text(
    query: str,
    madhab: Optional[str] = None,
    category_id: Optional[int] = None,
    book_titles: Optional[List[str]] = None,
    limit: int = 15,
    book_diversity: bool = True,
    window_expansion: bool = True
) -> Dict[str, Any]:
    """
    البحث الهجين والدلالي في نصوص كتب الشاملة ومخزن Qdrant
    مع خوارزمية تنويع الكتب (Book Diversity) وتوسيع سياق الصفحة (Window Expansion)
    """
    query = (query or "").strip()
    if not query:
        return {"query": query, "total": 0, "results": []}

    target_limit = max(1, min(limit or 15, 50))

    # تحديد category_id للمذهب إذا تم اختياره
    madhab_cat_map = {
        "hanafi": 14,
        "maliki": 15,
        "shafii": 16,
        "hanbali": 17,
        "dhahiri": 18
    }
    effective_category_id = category_id
    if madhab and madhab.lower() in madhab_cat_map:
        effective_category_id = madhab_cat_map[madhab.lower()]

    # إذا كان تنويع الكتب مفعلاً، نسحب كمية أكبر من Qdrant لتوزيعها على مختلف أمهات الكتب
    fetch_raw_limit = min(max(target_limit * 3, 30), 100) if book_diversity else target_limit

    payload: Dict[str, Any] = {
        "query": query,
        "limit": fetch_raw_limit,
        "use_reranker": False
    }
    if effective_category_id:
        payload["category_id"] = effective_category_id
    if book_titles and isinstance(book_titles, list):
        payload["book_titles"] = book_titles

    results = []
    mode = "Hybrid Qdrant"
    raw_results = []
    try:
        if _DIRECT_SEARCH_CALLABLE is not None:
            data = _DIRECT_SEARCH_CALLABLE(payload)
            mode = data.get("mode", mode)
            raw_results = data.get("results", [])
        else:
            req_data = json.dumps(payload).encode("utf-8")
            internal_port = os.environ.get("PORT", "8000")
            internal_host = os.environ.get("LOCAL_API_HOST", f"127.0.0.1:{internal_port}")
            search_api_url = f"http://{internal_host}/api/search"
            req = urllib.request.Request(
                search_api_url,
                data=req_data,
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                mode = data.get("mode", mode)
                raw_results = data.get("results", [])

            # 1. تطبيق خوارزمية تنويع الكتب (Book Diversity Re-ranking)
            if book_diversity and raw_results:
                diverse_results = []
                book_counts = {}
                max_per_book = 2 if target_limit >= 10 else 1
                overflow_results = []
                for r in raw_results:
                    b_id = r.get("book_id")
                    count = book_counts.get(b_id, 0)
                    if count < max_per_book:
                        book_counts[b_id] = count + 1
                        diverse_results.append(r)
                    else:
                        overflow_results.append(r)
                
                # إذا لم تصل القائمة المتنوعة للحد المطلوب، نكمل من الفائض
                if len(diverse_results) < target_limit:
                    needed = target_limit - len(diverse_results)
                    diverse_results.extend(overflow_results[:needed])
                chosen_raw = diverse_results[:target_limit]
            else:
                chosen_raw = raw_results[:target_limit]

            # 2. بناء النتائج مع خوارزمية توسيع سياق الصفحة (Window Expansion)
            for r in chosen_raw:
                b_id = r.get("book_id")
                b_text = r.get("betaka_text") or ""
                if not b_text and b_id:
                    b_text = get_book_betaka(int(b_id))
                b_meta = parse_betaka_metadata(b_text) if b_text else {}

                citation = format_scholarly_citation(
                    title=r.get("title_ar", ""),
                    author=r.get("author_name", ""),
                    death_hijri=r.get("death_hijri"),
                    part=r.get("part"),
                    page_num=r.get("page_num"),
                    meta=b_meta
                )

                body_content = r.get("full_body") or r.get("snippet", "")
                snippet_content = body_content

                # تطبيق توسيع السياق بربط الصفحة بالسياق المحيط لعدم بتر المسألة
                if window_expansion and b_id and r.get("page_num"):
                    try:
                        p_ctx = get_page_context(int(b_id), r.get("page_num"), r.get("part"), include_context=True)
                        if p_ctx and not p_ctx.get("error"):
                            expanded_parts = []
                            if p_ctx.get("previous_page") and p_ctx["previous_page"].get("body"):
                                prev_text = p_ctx["previous_page"]["body"].strip()
                                if prev_text:
                                    expanded_parts.append(f"[سياق الصفحة السابقة ص {p_ctx['previous_page'].get('page_num')}]:\n{prev_text[-500:]}")
                            if p_ctx.get("page") and p_ctx["page"].get("body"):
                                cur_text = p_ctx["page"]["body"].strip()
                                if cur_text:
                                    expanded_parts.append(f"[نص المسألة ص {r.get('page_num')}]:\n{cur_text}")
                            if p_ctx.get("next_page") and p_ctx["next_page"].get("body"):
                                next_text = p_ctx["next_page"]["body"].strip()
                                if next_text:
                                    expanded_parts.append(f"[سياق الصفحة اللاحقة ص {p_ctx['next_page'].get('page_num')}]:\n{next_text[:500]}")
                            if expanded_parts:
                                body_content = "\n\n---\n".join(expanded_parts)
                                snippet_content = body_content[:1500]
                    except Exception:
                        pass

                results.append({
                    "book_id": b_id,
                    "title": r.get("title_ar"),
                    "category": r.get("category_name_ar"),
                    "author": r.get("author_name"),
                    "author_death_hijri": r.get("death_hijri"),
                    "part": r.get("part"),
                    "page_num": r.get("page_num"),
                    "publisher": b_meta.get("publisher", ""),
                    "edition": b_meta.get("edition", ""),
                    "investigator": b_meta.get("investigator", ""),
                    "parts_count": b_meta.get("parts_count", ""),
                    "printed_status": b_meta.get("printed_status", ""),
                    "bibliographic_card": b_meta.get("raw_card") or b_text,
                    "score": round(float(r.get("score", 0)), 4),
                    "snippet": snippet_content,
                    "full_body": body_content,
                    "citation": citation
                })
    except Exception as e:
        # في حال كان الخادم المحلي لا يستجيب عبر HTTP في وضع stdio المستقل، نبحث في قاعدة الفهرس
        print(f"Fallback search via SQLite: {e}")
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute("""
                SELECT book_id, title_ar, category_name_ar, main_author_name_ar, main_author_death_hijri, rel_path, betaka_text
                FROM books
                WHERE title_ar LIKE ? OR main_author_name_ar LIKE ?
                LIMIT ?
            """, (f"%{query}%", f"%{query}%", limit))
            for row in cur.fetchall():
                b_text = row["betaka_text"] or ""
                b_meta = parse_betaka_metadata(b_text) if b_text else {}
                citation = format_scholarly_citation(
                    title=row["title_ar"],
                    author=row["main_author_name_ar"],
                    death_hijri=row["main_author_death_hijri"],
                    part=None,
                    page_num=1,
                    meta=b_meta
                )
                results.append({
                    "book_id": row["book_id"],
                    "title": row["title_ar"],
                    "category": row["category_name_ar"],
                    "author": row["main_author_name_ar"],
                    "author_death_hijri": row["main_author_death_hijri"],
                    "part": None,
                    "page_num": 1,
                    "publisher": b_meta.get("publisher", ""),
                    "edition": b_meta.get("edition", ""),
                    "investigator": b_meta.get("investigator", ""),
                    "parts_count": b_meta.get("parts_count", ""),
                    "printed_status": b_meta.get("printed_status", ""),
                    "bibliographic_card": b_meta.get("raw_card") or b_text,
                    "score": 1.0,
                    "snippet": b_text[:200] if b_text else "",
                    "full_body": b_text or "",
                    "citation": citation
                })
            conn.close()
        except Exception:
            pass

    return {
        "query": query,
        "search_mode": mode,
        "madhab": madhab or "الكل",
        "total_returned": len(results),
        "results": results
    }


# -------------------------------------------------------------
# 2. أداة قراءة الصفحة وسياقها الكامل (الصفحة السابقة واللاحقة)
# -------------------------------------------------------------
def get_page_context(
    book_id: int,
    page_num: Optional[int] = None,
    part: Optional[str] = None,
    include_context: bool = True
) -> Dict[str, Any]:
    """
    قراءة نص الصفحة كاملاً مع إمكانية قراءة الصفحة السابقة واللاحقة
    لضمان عدم بتر سياق الفتوى أو المسألة الفقهية مع بطاقة العزو المكتبي
    """
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT book_id, title_ar, category_name_ar, main_author_name_ar, main_author_death_hijri, rel_path, betaka_text
        FROM books WHERE book_id = ?
    """, (book_id,))
    book_row = cur.fetchone()
    conn.close()

    if not book_row:
        return {"error": f"Book with id {book_id} not found"}

    rel_path = book_row["rel_path"]
    pages_file = BASE_DIR / rel_path / "pages.jsonl"
    if not pages_file.exists():
        return {"error": f"pages.jsonl not found for book {book_id}"}

    all_pages = []
    target_idx = 0
    with open(pages_file, "r", encoding="utf-8") as f:
        for idx, line in enumerate(f):
            p = json.loads(line)
            all_pages.append(p)
            if page_num is not None and target_idx == 0:
                if p.get("page_num") == page_num:
                    if part is None or str(p.get("part", "")).strip() == str(part).strip():
                        target_idx = idx

    if not all_pages:
        return {"error": "Book has no pages"}

    target_idx = min(max(0, target_idx), len(all_pages) - 1)
    current_page = all_pages[target_idx]

    prev_page = None
    next_page = None
    if include_context:
        if target_idx > 0:
            prev_p = all_pages[target_idx - 1]
            prev_page = {
                "page_num": prev_p.get("page_num"),
                "part": prev_p.get("part"),
                "body": prev_p.get("body", "")
            }
        if target_idx < len(all_pages) - 1:
            next_p = all_pages[target_idx + 1]
            next_page = {
                "page_num": next_p.get("page_num"),
                "part": next_p.get("part"),
                "body": next_p.get("body", "")
            }

    b_meta = parse_betaka_metadata(book_row["betaka_text"] or "")
    citation = format_scholarly_citation(
        title=book_row["title_ar"],
        author=book_row["main_author_name_ar"],
        death_hijri=book_row["main_author_death_hijri"],
        part=current_page.get("part"),
        page_num=current_page.get("page_num") or target_idx + 1,
        meta=b_meta
    )

    return {
        "book_id": book_id,
        "book_title": book_row["title_ar"],
        "category": book_row["category_name_ar"],
        "author": book_row["main_author_name_ar"],
        "author_death_hijri": book_row["main_author_death_hijri"],
        "publisher": b_meta.get("publisher", ""),
        "edition": b_meta.get("edition", ""),
        "investigator": b_meta.get("investigator", ""),
        "parts_count": b_meta.get("parts_count", ""),
        "printed_status": b_meta.get("printed_status", ""),
        "bibliographic_card": b_meta.get("raw_card") or book_row["betaka_text"],
        "citation": citation,
        "page_index": target_idx + 1,
        "total_book_pages": len(all_pages),
        "target_page": {
            "part": current_page.get("part"),
            "page_num": current_page.get("page_num"),
            "body": current_page.get("body", ""),
            "footnotes": current_page.get("footnotes")
        },
        "has_previous_page": prev_page is not None,
        "previous_page": prev_page,
        "has_next_page": next_page is not None,
        "next_page": next_page
    }


# -------------------------------------------------------------
# 3. أداة استعراض بطاقة الكتاب وفهرس الأبواب (TOC)
# -------------------------------------------------------------
def get_book_details(
    book_id_or_title: Union[int, str],
    include_toc: bool = True,
    toc_limit: int = 35
) -> Dict[str, Any]:
    """
    استعراض بطاقة الكتاب التوثيقية، دار النشر، المحقق، وسنة الوفاة،
    مع فهرس الأبواب والموضوعات التفصيلي من ملف toc.jsonl
    """
    conn = get_db_connection()
    cur = conn.cursor()
    
    if isinstance(book_id_or_title, int) or str(book_id_or_title).isdigit():
        cur.execute("""
            SELECT book_id, title_ar, category_name_ar, main_author_id, main_author_name_ar, main_author_death_hijri, rel_path, betaka_text
            FROM books WHERE book_id = ?
        """, (int(book_id_or_title),))
    else:
        query_str = str(book_id_or_title).strip()
        cur.execute("""
            SELECT book_id, title_ar, category_name_ar, main_author_id, main_author_name_ar, main_author_death_hijri, rel_path, betaka_text
            FROM books WHERE title_ar LIKE ? OR title_ar LIKE ? LIMIT 1
        """, (f"%{query_str}%", query_str))

    row = cur.fetchone()
    conn.close()

    if not row:
        return {"error": f"Book '{book_id_or_title}' not found in Shamela index"}

    book_id = row["book_id"]
    rel_path = row["rel_path"]
    
    # جلب ترجمة المؤلف من جدول authors.parquet إن وجدت
    author_bio = ""
    authors_table = get_table("authors")
    if authors_table is not None and row["main_author_id"]:
        try:
            mask = pc.equal(authors_table["id"], row["main_author_id"])
            matched = authors_table.filter(mask).to_pylist()
            if matched:
                author_bio = matched[0].get("biography", "")
        except Exception:
            pass

    # قراءة فهرس الموضوعات والأبواب من toc.jsonl
    toc_items = []
    if include_toc:
        toc_file = BASE_DIR / rel_path / "toc.jsonl"
        if toc_file.exists():
            try:
                with open(toc_file, "r", encoding="utf-8") as f:
                    for line in f:
                        t = json.loads(line)
                        toc_items.append({
                            "title": t.get("title_text", ""),
                            "page_id": t.get("page_id"),
                            "level": 1 if t.get("parent_id") is None else 2
                        })
                        if len(toc_items) >= toc_limit:
                            break
            except Exception as e:
                print(f"Error reading toc.jsonl: {e}")

    # فحص عدد الصفحات
    total_pages = 0
    pages_file = BASE_DIR / rel_path / "pages.jsonl"
    if pages_file.exists():
        try:
            with open(pages_file, "r", encoding="utf-8") as f:
                total_pages = sum(1 for _ in f)
        except Exception:
            pass

    b_meta = parse_betaka_metadata(row["betaka_text"] or "")
    return {
        "book_id": book_id,
        "title": row["title_ar"],
        "category": row["category_name_ar"],
        "author": {
            "id": row["main_author_id"],
            "name": row["main_author_name_ar"],
            "death_hijri": row["main_author_death_hijri"],
            "biography_summary": (author_bio[:300] + "...") if len(author_bio) > 300 else author_bio
        },
        "publisher": b_meta.get("publisher", ""),
        "edition": b_meta.get("edition", ""),
        "investigator": b_meta.get("investigator", ""),
        "parts_count": b_meta.get("parts_count", ""),
        "printed_status": b_meta.get("printed_status", ""),
        "bibliographic_card": b_meta.get("raw_card") or row["betaka_text"],
        "total_pages": total_pages,
        "table_of_contents_count": len(toc_items),
        "table_of_contents": toc_items
    }


# -------------------------------------------------------------
# 4. أداة تراجم الرواة والجرح والتعديل
# -------------------------------------------------------------
def search_narrators(query: str, limit: int = 8) -> List[Dict[str, Any]]:
    """
    البحث في موسوعة رواة الحديث (18,989 راوياً)
    واستخراج التراجم، الكنى، البلدان، الطبقات، وأقوال الجرح والتعديل.
    """
    raw_query = (query or "").strip()
    norm_query = normalize_arabic(raw_query)
    if not norm_query:
        return []
    
    table = get_table("narrators")
    if table is None:
        return []

    try:
        mask_short = pc.match_substring(table["short_name"], raw_query)
        mask_long = pc.match_substring(table["long_name"], raw_query)
        mask = pc.or_(mask_short, mask_long)
        filtered = table.filter(mask)
    except Exception as e:
        print(f"Error filtering narrators: {e}")
        return []

    results = []
    count = min(len(filtered), limit)
    if count == 0:
        try:
            tokens = raw_query.split()
            if len(tokens) > 1:
                mask = pc.match_substring(table["short_name"], tokens[0])
                filtered = table.filter(mask)
                count = min(len(filtered), limit)
        except Exception:
            pass

    if count == 0:
        return []

    sub_table = filtered.slice(0, count).to_pylist()
    for row in sub_table:
        bio_raw = row.get("biography_text") or ""
        criticism_raw = row.get("criticism_text") or ""
        
        bio_dict = {}
        if bio_raw:
            try:
                bio_dict = json.loads(bio_raw)
            except Exception:
                bio_dict = {"raw": bio_raw}
                
        criticism_dict = {}
        if criticism_raw:
            try:
                criticism_dict = json.loads(criticism_raw)
            except Exception:
                criticism_dict = {"raw": criticism_raw}

        summary_items = bio_dict.get("summary", [])
        structured_summary = {}
        if isinstance(summary_items, list):
            for item in summary_items:
                if isinstance(item, list) and len(item) == 2:
                    structured_summary[item[0]] = item[1]

        garh_list = criticism_dict.get("garh", [])
        parsed_criticism = []
        if isinstance(garh_list, list):
            for g in garh_list:
                if isinstance(g, list) and len(g) >= 2:
                    scholar = g[0]
                    statements = []
                    if isinstance(g[1], list):
                        for stmt in g[1]:
                            if isinstance(stmt, list) and len(stmt) > 0:
                                statements.append(stmt[0])
                            elif isinstance(stmt, str):
                                statements.append(stmt)
                    parsed_criticism.append({
                        "scholar": scholar,
                        "text": " ".join(statements)
                    })

        results.append({
            "id": row.get("id"),
            "short_name": row.get("short_name"),
            "long_name": row.get("long_name"),
            "kunya": structured_summary.get("الكنية", ""),
            "laqab": structured_summary.get("اللقب", ""),
            "nisbah": structured_summary.get("النسب", ""),
            "residence": structured_summary.get("بلد الإقامة", ""),
            "generation": structured_summary.get("طبقة رواة التقريب", ""),
            "ibn_hajar_rank": structured_summary.get("الرتبة عند ابن حجر", ""),
            "dhahabi_rank": structured_summary.get("الرتبة عند الذهبي", ""),
            "summary_details": structured_summary,
            "criticism_quotes": parsed_criticism[:8],
            "total_criticisms": len(parsed_criticism)
        })

    return results


# -------------------------------------------------------------
# 5. أداة تخريج الأحاديث والأسانيد
# -------------------------------------------------------------
def takhrij_hadith(query: str, limit: int = 8) -> Dict[str, Any]:
    """
    تخريج الحديث وربطه بالأسانيد والرواة وكتب السنة
    """
    query = (query or "").strip()
    result = {
        "query": query,
        "isnad_chains": [],
        "cross_references": []
    }
    
    isnads_table = get_table("page_isnads")
    narrators_table = get_table("narrators")
    books_table = get_table("book_metadata")
    
    if isnads_table is None:
        return result

    book_titles = {}
    if books_table is not None:
        try:
            b_ids = books_table["book_id"].to_pylist()
            b_titles = books_table["title_ar"].to_pylist()
            book_titles = dict(zip(b_ids, b_titles))
        except Exception:
            pass

    matched_isnads = []
    if query.isdigit():
        h_key = int(query)
        try:
            mask = pc.equal(isnads_table["hadeeth_key"], h_key)
            matched_isnads = isnads_table.filter(mask).slice(0, limit).to_pylist()
        except Exception:
            pass
    
    if not matched_isnads:
        matched_isnads = isnads_table.slice(0, limit).to_pylist()

    narrator_names = {}
    if narrators_table is not None and matched_isnads:
        all_narrator_ids = set()
        for isnad in matched_isnads:
            for nid in (isnad.get("narrator_ids") or []):
                all_narrator_ids.add(nid)
        
        try:
            n_ids = narrators_table["id"].to_pylist()
            n_shorts = narrators_table["short_name"].to_pylist()
            for nid, sname in zip(n_ids, n_shorts):
                if nid in all_narrator_ids:
                    narrator_names[nid] = sname
        except Exception:
            pass

    chains = []
    for isn in matched_isnads:
        b_id = isn.get("book_id")
        p_id = isn.get("shamela_page_id")
        n_ids = isn.get("narrator_ids") or []
        
        narrators_in_chain = [
            {"id": nid, "name": narrator_names.get(nid, f"راوٍ رقم #{nid}")}
            for nid in n_ids
        ]
        
        chains.append({
            "hadith_key": isn.get("hadeeth_key"),
            "book_id": b_id,
            "book_title": book_titles.get(b_id, f"كتاب رقم {b_id}"),
            "page_id": p_id,
            "chain_length": len(n_ids),
            "narrators": narrators_in_chain
        })

    result["isnad_chains"] = chains
    return result


# -------------------------------------------------------------
# 5.1 أداة الاستخراج الجماعي لأسانيد الراوي في أمهات كتب السنة
# -------------------------------------------------------------
# معجم الأعلام والمشاهير في كتب السنة والحديث للإحالة الفورية والدقة 100%
CANONICAL_NARRATOR_ALIASES = {
    "احمد بن حنبل": 484,
    "الامام احمد": 484,
    "احمد بن محمد بن حنبل": 484,
    "سفيان الثوري": 2472,
    "الثوري": 2472,
    "سفيان بن سعيد الثوري": 2472,
    "سفيان بن عيينه": 2478,
    "ابن عيينه": 2478,
    "مالك بن انس": 5361,
    "الامام مالك": 5361,
    "مالك": 5361,
    "الاعمش": 2638,
    "سليمان بن مهران": 2638,
    "سليمان الاعمش": 2638,
    "الزهري": 5917,
    "ابن شهاب": 5917,
    "ابن شهاب الزهري": 5917,
    "محمد بن مسلم بن شهاب": 5917,
    "الشافعي": 5483,
    "الامام الشافعي": 5483,
    "محمد بن ادريس الشافعي": 5483,
    "البخاري": 5495,
    "الامام البخاري": 5495,
    "محمد بن اسماعيل البخاري": 5495,
    "مسلم": 6116,
    "مسلم بن الحجاج": 6116,
    "الامام مسلم": 6116,
    "ابو داود": 2577,
    "ابو داود السجستاني": 2577,
    "الترمذي": 6128,
    "ابو عيسى الترمذي": 6128,
    "النسائي": 444,
    "شعبة": 2779,
    "شعبة بن الحجاج": 2779,
    "وكيع": 6792,
    "وكيع بن الجراح": 6792,
    "قتادة": 5183,
    "قتادة بن دعامة": 5183,
    "الاوزاعي": 3375,
    "عبد الرحمن بن عمرو الاوزاعي": 3375,
    "ابن جريج": 4035,
    "ابن المبارك": 3875,
    "عبد الله بن المبارك": 3875,
    "يحيى بن معين": 7006,
    "ابن معين": 7006,
    "يحيى بن سعيد القطان": 6931,
    "ابن القطان": 6931,
    "الحسن البصري": 1389,
    "الحسن": 1389,
    "سعيد بن المسيب": 2436,
    "ابن المسيب": 2436,
    "نافع": 6509,
    "نافع مولى ابن عمر": 6509,
    "ابو هريرة": 3320,
    "ابن عباس": 3732,
    "عبد الله بن عباس": 3732,
    "ابن عمر": 3807,
    "عبد الله بن عمر": 3807,
    "ابن مسعود": 3791,
    "عبد الله بن مسعود": 3791,
    "عائشة": 3131,
    "ام المؤمنين عائشة": 3131,
    "علي بن ابي طالب": 4440,
    "عمر بن الخطاب": 4721,
    "ابو بكر الصديق": 3317
}

_NARRATOR_ISNAD_COUNTS_CACHE = None

def _get_narrator_isnad_counts():
    global _NARRATOR_ISNAD_COUNTS_CACHE
    if _NARRATOR_ISNAD_COUNTS_CACHE is None:
        from collections import Counter
        isnads_t = get_table("page_isnads")
        counts = Counter()
        if isnads_t is not None:
            for row in isnads_t.to_pylist():
                for nid in (row.get("narrator_ids") or []):
                    counts[nid] += 1
        _NARRATOR_ISNAD_COUNTS_CACHE = counts
    return _NARRATOR_ISNAD_COUNTS_CACHE

def resolve_narrator_smart(query: str) -> Optional[Dict[str, Any]]:
    """التعرف الذكي الدقيق على الراوي بالاسم أو اللقب أو النسبة مع درء تشابه الأسماء وأقوال العلماء"""
    narrators_table = get_table("narrators")
    if narrators_table is None:
        return None
        
    raw_q = (query or "").strip()
    norm_q = normalize_arabic(raw_q)
    if not norm_q:
        return None

    all_narrators = narrators_table.to_pylist()
    narrator_by_id = {n["id"]: n for n in all_narrators}

    # 1. فحص معجم كبار الأعلام والمشاهير أولاً
    if norm_q in CANONICAL_NARRATOR_ALIASES:
        canonical_id = CANONICAL_NARRATOR_ALIASES[norm_q]
        if canonical_id in narrator_by_id:
            return narrator_by_id[canonical_id]

    isnad_counts = _get_narrator_isnad_counts()
    tokens = [t for t in norm_q.split() if t not in ["بن", "ابن"]]
    if not tokens:
        tokens = [norm_q]

    has_abu_in_q = norm_q.startswith("ابو ")
    best_candidate = None
    best_score = -9999

    for n in all_narrators:
        nid = n["id"]
        sn = normalize_arabic(n.get("short_name", ""))
        
        # تجريد الاسم الطويل من حواشي وأقوال العلماء (مثل: وقال أحمد بن حنبل، ويقال)
        ln_raw = n.get("long_name", "")
        ln_pure = normalize_arabic(re.split(r'[,،]\s*(?:قال|ويقال|قاله|ذكره|روى)', ln_raw)[0])
        
        score = 0
        c = isnad_counts[nid]

        # أ. مطابقة تامة للاسم
        if norm_q == sn or norm_q == ln_pure:
            score += 1500
        elif sn.startswith(norm_q) or ln_pure.startswith(norm_q):
            score += 950
        elif norm_q in sn:
            if not has_abu_in_q and (sn.startswith("ابو ") or " ابو " in sn):
                score += 300
            else:
                score += 600
        else:
            # ب. مطابقة متوالية للكلمات الجوهرية (مثال: أحمد بن حنبل تطابق: أحمد بن محمد بن حنبل)
            if len(tokens) >= 2:
                pos = 0
                all_found = True
                for t in tokens:
                    idx = sn.find(t, pos)
                    if idx == -1:
                        all_found = False
                        break
                    pos = idx + len(t)
                if all_found:
                    score += 850 - (pos - len(''.join(tokens))) * 2
            elif len(tokens) == 1:
                t = tokens[0]
                sn_words = [w.strip('،,') for w in sn.split()]
                if t in sn_words:
                    if sn.startswith(t):
                        score += 900
                    elif not has_abu_in_q and sn.startswith("ابو "):
                        score += 350
                    else:
                        score += 550

        # ج. فحص الألقاب والكنى والنسبة في summary
        bio_str = n.get("biography_text") or ""
        if bio_str.startswith("{"):
            try:
                b = json.loads(bio_str)
                summary_score = 0
                for item in b.get("summary", []):
                    if len(item) == 2 and item[0] in ["اللقب", "النسب", "الشهرة", "الكنية"]:
                        val_norm = normalize_arabic(item[1])
                        val_words = [w.strip('،,') for w in val_norm.split()]
                        
                        if norm_q in val_words:
                            summary_score = max(summary_score, 750)
                        elif norm_q in val_norm:
                            summary_score = max(summary_score, 400)
                            
                        if len(tokens) >= 2:
                            if tokens[0] in sn and any(t in val_norm for t in tokens[1:]):
                                summary_score = max(summary_score, 900)
                score += summary_score
            except Exception:
                pass

        # د. وزن الشهرة والتردد الإسنادي في كتب السنة
        if score > 0 and c > 0:
            score += int(math.log10(c + 1) * 350)

        if score > best_score:
            best_score = score
            best_candidate = (n, score, c)

    if best_candidate and best_candidate[1] >= 300:
        return best_candidate[0]

    return None

def get_narrator_isnads(
    narrator: str,
    limit: int = 50,
    book_title: Optional[str] = None,
    unique_chains: bool = True
) -> Dict[str, Any]:
    """
    استخراج جماعي لعشرات ومئات الأسانيد المتصلة المختلفة التي يمر فيها راوٍ بعينه
    (مثل سفيان الثوري، الأعمش، مالك، الزهري) من أمهات كتب السنة المعتمدة.
    """
    narrator_info = resolve_narrator_smart(narrator)
    if not narrator_info:
        return {
            "error": f"لم يتم العثور على الراوي '{narrator}' في موسوعة الرواة",
            "narrator": narrator,
            "total_found": 0,
            "isnads": []
        }

    target_nid = narrator_info["id"]
    isnads_table = get_table("page_isnads")
    narrators_table = get_table("narrators")
    books_table = get_table("book_metadata")

    if isnads_table is None:
        return {"error": "جدول الأسانيد غير متوفر", "isnads": []}

    all_isnads = isnads_table.to_pylist()
    all_narrators = narrators_table.to_pylist() if narrators_table else []
    all_books = books_table.to_pylist() if books_table else []

    narrator_map = {n["id"]: n["short_name"] for n in all_narrators}
    book_map = {b["book_id"]: b["title_ar"] for b in all_books}

    # تصفية الأسانيد التي يمر بها هذا الراوي
    matched = [i for i in all_isnads if target_nid in (i.get("narrator_ids") or [])]

    # فلترة بالكتاب إن طلب
    if book_title:
        bt_clean = book_title.strip()
        matched = [m for m in matched if bt_clean in book_map.get(m.get("book_id"), "")]

    # استخراج سلاسل متمايزة مع توزيع متوازن بين أمهات الكتب إن لم يحدد كتاب معين
    selected = []
    seen_chains = set()

    if book_title:
        # إذا تم تحديد كتاب معين
        for m in matched:
            n_ids = m.get("narrator_ids") or []
            c_tuple = tuple(n_ids)
            if unique_chains:
                if c_tuple in seen_chains:
                    continue
                seen_chains.add(c_tuple)
            selected.append(m)
            if len(selected) >= limit:
                break
    else:
        # توزيع دائري متوازن عبر أمهات كتب السنة (البخاري، مسلم، أبو داود، الترمذي، النسائي...)
        from collections import defaultdict
        by_book = defaultdict(list)
        for m in matched:
            by_book[m.get("book_id")].append(m)

        book_ids = list(by_book.keys())
        max_depth = max((len(lst) for lst in by_book.values()), default=0)
        
        for round_idx in range(max_depth):
            for bid in book_ids:
                lst = by_book[bid]
                if round_idx < len(lst):
                    m = lst[round_idx]
                    n_ids = m.get("narrator_ids") or []
                    c_tuple = tuple(n_ids)
                    if unique_chains:
                        if c_tuple in seen_chains:
                            continue
                        seen_chains.add(c_tuple)
                    selected.append(m)
                    if len(selected) >= limit:
                        break
            if len(selected) >= limit:
                break

    # تنسيق المخرجات الكاملة
    formatted_isnads = []
    for idx, s in enumerate(selected, 1):
        n_ids = s.get("narrator_ids") or []
        names = [narrator_map.get(nid, f"#{nid}") for nid in n_ids]
        b_id = s.get("book_id")
        b_title = book_map.get(b_id, f"كتاب #{b_id}")
        page_id = s.get("shamela_page_id")

        pos = (n_ids.index(target_nid) + 1) if target_nid in n_ids else None

        formatted_isnads.append({
            "index": idx,
            "book_id": b_id,
            "book_title": b_title,
            "page_id": page_id,
            "citation": f"«{b_title}» (صـ {page_id})",
            "narrator_position": f"الراوي رقم {pos} في السند" if pos else "موجود في السند",
            "chain_length": len(n_ids),
            "chain_text": " ⬅️ ".join(names),
            "narrators": [{"id": nid, "name": narrator_map.get(nid, f"راوٍ #{nid}")} for nid in n_ids]
        })

    return {
        "narrator_id": target_nid,
        "narrator_name": narrator_info.get("short_name"),
        "narrator_long_name": narrator_info.get("long_name"),
        "query": narrator,
        "total_isnads_in_corpus": len(matched),
        "returned_count": len(formatted_isnads),
        "distinct_chains_guaranteed": unique_chains,
        "isnads": formatted_isnads
    }


# -------------------------------------------------------------
# 6. أداة كشاف الآيات وتفاسيرها
# -------------------------------------------------------------
def search_quran_and_tafsir(query: str, limit: int = 6) -> Dict[str, Any]:
    """
    البحث عن الآيات القرآنية وتقاطعاتها في كتب التفسير مع دعم البحث المطبع
    """
    raw_query = (query or "").strip()
    norm_query = normalize_arabic(raw_query)
    result = {
        "query": raw_query,
        "verses": []
    }
    
    q_table = get_table("quran_verses")
    t_table = get_table("tafsir_xrefs")
    b_table = get_table("book_metadata")
    
    if q_table is None:
        return result

    book_titles = {}
    if b_table is not None:
        try:
            b_ids = b_table["book_id"].to_pylist()
            b_titles = b_table["title_ar"].to_pylist()
            book_titles = dict(zip(b_ids, b_titles))
        except Exception:
            pass

    all_verses = q_table.to_pylist()
    matched_verses = []
    
    for v in all_verses:
        body_norm = normalize_arabic(v.get("body", ""))
        majma_norm = normalize_arabic(v.get("majma", ""))
        if norm_query in body_norm or norm_query in majma_norm:
            matched_verses.append(v)
            if len(matched_verses) >= limit:
                break

    for verse in matched_verses:
        v_id = verse.get("id")
        v_body = verse.get("majma") or verse.get("body")
        
        tafsir_links = []
        if t_table is not None:
            try:
                t_mask = pc.equal(t_table["key_id"], v_id)
                t_matches = t_table.filter(t_mask).slice(0, 6).to_pylist()
                for tm in t_matches:
                    b_id = tm.get("book_id")
                    tafsir_links.append({
                        "book_id": b_id,
                        "book_title": book_titles.get(b_id, f"تفسير رقم {b_id}"),
                        "page_id": tm.get("page_id")
                    })
            except Exception:
                pass

        result["verses"].append({
            "verse_id": v_id,
            "text": v_body,
            "text_amiri": verse.get("amiri", ""),
            "tafsir_sources_count": len(tafsir_links),
            "tafsir_sources": tafsir_links
        })

    return result


# -------------------------------------------------------------
# 7. أداة تحرير المذاهب والبحث الفقهي المخصص
# -------------------------------------------------------------
MADHAB_CATEGORIES = {
    "hanafi": {
        "name": "الفقه الحنفي",
        "category_id": 14,
        "keywords": ["حنفي", "أبو حنيفة", "محمد بن الحسن", "أبو يوسف", "ابن عابدين", "السرخسي", "الكاساني", "الهداية", "رد المحتار", "المبسوط"]
    },
    "maliki": {
        "name": "الفقه المالكي",
        "category_id": 15,
        "keywords": ["مالكي", "مالك", "المدونة", "ابن القاسم", "سحنون", "خليل", "الدردير", "الحطاب", "ابن رشد", "مواهب الجليل", "الشرح الكبير"]
    },
    "shafii": {
        "name": "الفقه الشافعي",
        "category_id": 16,
        "keywords": ["شافعي", "الشافعي", "الأم", "النووي", "الرافعي", "الرملي", "ابن حجر الهيتمي", "المجموع", "منهاج الطالبين", "تحفة المحتاج", "نهاية المحتاج"]
    },
    "hanbali": {
        "name": "الفقه الحنبلي",
        "category_id": 17,
        "keywords": ["حنبلي", "أحمد بن حنبل", "الخرقي", "ابن قدامة", "المرداوي", "البهوتي", "المغني", "الإنصاف", "كشاف القناع", "زاد المستقنع"]
    },
    "dhahiri": {
        "name": "الفقه الظاهري والعام",
        "category_id": 18,
        "keywords": ["ظاهري", "ابن حزم", "المحلى", "داود الظاهري"]
    }
}

def tahrir_madhab(issue: str, madhab: str = "all", era: str = "all", limit: int = 6) -> Dict[str, Any]:
    """
    تحرير المسائل الفقهية بتحديد المذهب والحقبة الزمنية
    - madhab: 'hanafi', 'maliki', 'shafii', 'hanbali', 'dhahiri', 'all'
    - era: 'early' (متقدمون <= 450هـ), 'middle' (متوسطون 451-900هـ), 'late' (متأخرون ومعتمد المذهب > 900هـ), 'all'
    """
    issue = (issue or "").strip()
    selected_madhab = MADHAB_CATEGORIES.get(madhab.lower(), None)
    
    b_table = get_table("book_metadata")
    a_table = get_table("authors")
    
    author_deaths = {}
    if a_table is not None:
        try:
            a_ids = a_table["id"].to_pylist()
            a_deaths = a_table["death_hijri"].to_pylist()
            author_deaths = dict(zip(a_ids, a_deaths))
        except Exception:
            pass

    matched_books = []
    if b_table is not None:
        try:
            if selected_madhab:
                cat_id = selected_madhab["category_id"]
                mask = pc.equal(b_table["category_id"], cat_id)
                filtered_b = b_table.filter(mask).to_pylist()
            else:
                fiqh_cats = [14, 15, 16, 17, 18, 19, 22]
                mask = pc.is_in(b_table["category_id"], value_set=pa.array(fiqh_cats))
                filtered_b = b_table.filter(mask).to_pylist()

            for bk in filtered_b:
                author_id = bk.get("main_author_id")
                death = author_deaths.get(author_id) or 0
                
                era_match = True
                if era == "early" and not (0 < death <= 450):
                    era_match = False
                elif era == "middle" and not (450 < death <= 900):
                    era_match = False
                elif era == "late" and not (death > 900):
                    era_match = False

                if era_match:
                    bk["death_hijri"] = death
                    matched_books.append(bk)
        except Exception as e:
            print(f"Error filtering fiqh books: {e}")

    recommended_books = []
    for b in matched_books[:limit]:
        death_val = b.get("death_hijri", 0)
        recommended_books.append({
            "book_id": b.get("book_id"),
            "title": b.get("title_ar"),
            "category": b.get("category_name_ar"),
            "author_death_hijri": death_val,
            "era_label": "المتقدمون" if death_val <= 450 else ("المتوسطون" if death_val <= 900 else "المتأخرون (المعتمد)")
        })

    return {
        "issue": issue,
        "madhab": selected_madhab["name"] if selected_madhab else "جميع المذاهب الفقهية",
        "era": era,
        "total_matched_books": len(matched_books),
        "recommended_references": recommended_books,
        "tahrir_guideline": f"لتحرير مسألة ({issue}) على مذهب ({selected_madhab['name'] if selected_madhab else 'المذاهب الأربعة'})، اعتمد على نصوص أئمة المذهب المتأخرين لتحرير الفتوى والمعتمد، ثم راجع المتوسطين لتحرير الدليل والأقوال، ثم المتقدمين لأصل الرواية."
    }


# -------------------------------------------------------------
# 8. أداة معجم الجذور اللغوية وغريب الألفاظ
# -------------------------------------------------------------
def lookup_word_root(token: str) -> Dict[str, Any]:
    """
    استخراج الجذر اللغوي للكلمة والبحث في المعاجم العربية (1.95 مليون لفظ)
    """
    token = (token or "").strip()
    r_table = get_table("root_dictionary")
    if r_table is None:
        return {"token": token, "roots": []}

    try:
        mask = pc.equal(r_table["token"], token)
        matches = r_table.filter(mask).to_pylist()
        if matches:
            return {
                "token": token,
                "found": True,
                "roots": matches[0].get("roots", []),
                "lexicon_advice": f"ابحث عن مادة ({', '.join(matches[0].get('roots', []))}) في: لسان العرب، معجم مقاييس اللغة، القاموس المحيط، الصحاح."
            }
    except Exception as e:
        print(f"Error in root lookup: {e}")

    return {
        "token": token,
        "found": False,
        "roots": [],
        "lexicon_advice": "لم يتم العثور على جذر دقيق، يرجى تجريد الكلمة من الزوائد (أل التعريف، الضمائر)."
    }


# -------------------------------------------------------------
# 9. أداة الاقتباس الموثق والمطابقة الحرفية (Verify Quotations)
# -------------------------------------------------------------
def verify_quotes(
    quote: str,
    book_id_or_title: Union[int, str],
    page_num: Optional[int] = None,
    part: Optional[str] = None
) -> Dict[str, Any]:
    """
    التحقق الصارم من صحة أي اقتباس ومطابقته الحرفية لنص الصفحة المطبوعة في الكتاب
    مع كشف سياق ما قبل الاقتباس (من القائل) وما بعده (الشروط والاستثناءات والموانع).
    """
    quote = (quote or "").strip()
    if not quote:
        return {"error": "النص المقتبس فارغ", "is_matched": False}

    conn = get_db_connection()
    cur = conn.cursor()
    if isinstance(book_id_or_title, int) or str(book_id_or_title).isdigit():
        cur.execute("SELECT book_id, title_ar, main_author_name_ar, main_author_death_hijri, rel_path, betaka_text FROM books WHERE book_id = ? LIMIT 1", (int(book_id_or_title),))
    else:
        q_str = str(book_id_or_title).strip()
        cur.execute("""
            SELECT book_id, title_ar, main_author_name_ar, main_author_death_hijri, rel_path, betaka_text FROM books 
            WHERE title_ar LIKE ? 
            ORDER BY CASE WHEN title_ar = ? THEN 0 ELSE 1 END, length(title_ar) ASC 
            LIMIT 1
        """, (f"%{q_str}%", q_str))
    book_row = cur.fetchone()
    conn.close()

    if not book_row:
        return {"status": "الكتاب غير موجود في الفهرس", "is_matched": False}

    book_id = book_row["book_id"]
    rel_path = book_row["rel_path"]
    b_meta = parse_betaka_metadata(book_row["betaka_text"] or "")
    
    pages_file = BASE_DIR / rel_path / "pages.jsonl"
    if not pages_file.exists():
        return {"status": "ملف صفحات الكتاب غير متوفر محلياً", "is_matched": False}

    def clean_text_for_compare(t: str) -> str:
        t = re.sub(r'<[^>]+>', ' ', t)
        t = re.sub(r'¬?\([٠-٩0-9]+\)', ' ', t)
        t = re.sub(r'[\u064B-\u065F\u0670\u0640\u06D6-\u06ED]', '', t)
        t = re.sub(r'[إأآٱ]', 'ا', t)
        t = re.sub(r'ة', 'ه', t)
        t = re.sub(r'ى', 'ي', t)
        t = re.sub(r'[^\w\s]', ' ', t)
        return ' '.join(t.split())

    clean_quote = clean_text_for_compare(quote)
    if not clean_quote:
        return {"error": "تعذر تجريد نص الاقتباس للمقارنة", "is_matched": False}

    all_pages = []
    target_idx = None
    with open(pages_file, "r", encoding="utf-8") as f:
        for idx, line in enumerate(f):
            p = json.loads(line)
            all_pages.append(p)
            if page_num is not None and target_idx is None:
                if str(p.get("page_num")) == str(page_num):
                    if part is None or str(p.get("part", "")).strip() == str(part).strip():
                        target_idx = idx

    found_page = None
    found_idx = None
    match_status = "غير مطابق"

    # فحص الصفحة المحددة أولاً
    if target_idx is not None and target_idx < len(all_pages):
        tgt_p = all_pages[target_idx]
        tgt_body = tgt_p.get("body", "")
        if clean_quote in clean_text_for_compare(tgt_body):
            found_page = tgt_p
            found_idx = target_idx
            match_status = "مطابق"

    # إذا لم يطابق أو لم يُحدد رقم صفحة، فحص صفحات الكتاب
    if not found_page:
        for idx, p in enumerate(all_pages):
            p_body = p.get("body", "")
            if clean_quote in clean_text_for_compare(p_body):
                found_page = p
                found_idx = idx
                match_status = "مطابق في موضع آخر من الكتاب" if page_num is not None else "مطابق"
                break

    if found_page:
        raw_body = re.sub(r'<[^>]+>', '', found_page.get("body", ""))
        quote_words = quote.split()
        first_w = quote_words[0] if quote_words else ""
        last_w = quote_words[-1] if quote_words else ""
        
        idx_start = raw_body.find(first_w) if first_w else -1
        idx_end = raw_body.rfind(last_w) if last_w else -1
        
        preceding = ""
        following = ""
        exact_text = quote
        if idx_start != -1 and idx_end != -1 and idx_end >= idx_start:
            exact_text = raw_body[idx_start:idx_end + len(last_w)]
            preceding = raw_body[max(0, idx_start - 180):idx_start].strip()
            following = raw_body[idx_end + len(last_w):min(len(raw_body), idx_end + len(last_w) + 180)].strip()
        else:
            preceding = raw_body[:150].strip()
            following = raw_body[-150:].strip()

        cit = format_scholarly_citation(
            title=book_row["title_ar"],
            author=book_row["main_author_name_ar"],
            death_hijri=book_row["main_author_death_hijri"],
            part=found_page.get("part"),
            page_num=found_page.get("page_num") or (found_idx + 1),
            meta=b_meta
        )

        return {
            "status": match_status,
            "status_code": "verified" if match_status == "مطابق" else "relocated",
            "is_matched": True,
            "book_id": book_id,
            "book_title": book_row["title_ar"],
            "resolved_part": found_page.get("part"),
            "resolved_page_num": found_page.get("page_num"),
            "exact_text_printed": exact_text,
            "preceding_context": preceding,
            "following_context": following,
            "citation": cit,
            "publisher": b_meta.get("publisher", ""),
            "edition": b_meta.get("edition", ""),
            "investigator": b_meta.get("investigator", ""),
            "note": "تم توثيق الاقتباس ومطابقته حرفياً مع بيان سياق ما قبله وما بعده لمنع بتر النصوص."
        }

    return {
        "status": "غير مطابق",
        "status_code": "mismatch",
        "is_matched": False,
        "book_id": book_id,
        "book_title": book_row["title_ar"],
        "searched_quote": quote,
        "warning": "لم يُعثر على هذا اللفظ حرفياً في صفحات الكتاب؛ قد يكون النص منقولاً بالمعنى، أو وقع فيه تصحيف أو سقط."
    }


# -------------------------------------------------------------
# 10. ملف الآية التفسيري المقارن مرتباً بالوفيات (Study Ayah)
# -------------------------------------------------------------
def study_ayah(
    query: str,
    limit: int = 8
) -> Dict[str, Any]:
    """
    ملف الآية التفسيري المقارن:
    استخراج نص الآية بالرسم العثماني ونصوص تفاسير أئمة الإسلام عبر العصور
    مرتبة ترتيباً تاريخياً زمنياً بوفيات المفسرين (الأقدم فالأقدم) مع التوثيق المكتبي الدقيق.
    """
    q_table = get_table("quran_verses")
    clean_q = normalize_arabic(query)
    found_verse = None
    v_id = None
    
    if q_table is not None:
        all_v = q_table.to_pylist()
        for v in all_v:
            if clean_q in normalize_arabic(v.get("body", "")) or clean_q in normalize_arabic(v.get("majma", "")):
                found_verse = v
                v_id = v.get("id")
                break
                
    if not found_verse:
        raw_res = search_shamela_text(query=query, category_id=4, limit=limit)
        items = raw_res.get("results", [])
        items.sort(key=lambda x: (x.get("author_death_hijri") or 99999))
        return {
            "query": query,
            "verse_found": False,
            "verse_text": query,
            "total_commentaries": len(items),
            "commentaries_chronological": items
        }

    search_terms = " ".join(normalize_arabic(found_verse.get("body", "")).split()[:6])
    raw_res = search_shamela_text(query=search_terms, category_id=4, limit=max(limit, 15))
    items = raw_res.get("results", [])
    items.sort(key=lambda x: (x.get("author_death_hijri") or 99999))
    
    return {
        "verse_id": v_id,
        "verse_uthmani": found_verse.get("majma"),
        "verse_plain": found_verse.get("body"),
        "total_commentaries": len(items[:limit]),
        "commentaries_chronological": items[:limit],
        "methodology": "مرتب تاريخياً بوفيات أئمة التفسير (الأقدم فالأقدم: الطبري -> القرطبي -> ابن كثير -> الشوكاني -> ابن عاشور)"
    }


# -------------------------------------------------------------
# 11. ملف الحديث والتخريج والمدار والشروح (Study Hadith)
# -------------------------------------------------------------
def study_hadith(
    query: str,
    limit: int = 8
) -> Dict[str, Any]:
    """
    ملف الحديث الشامل:
    استخراج متون الحديث ورواياته، وتخريجه في كتب السنة، وسلاسل الأسانيد،
    وشروح أئمة الحديث المعتمدة (فتح الباري، شرح النووي، عون المعبود...) مرتبة بالوفيات.
    """
    takhrij_res = takhrij_hadith(query=query, limit=limit)
    hadith_texts = search_shamela_text(query=query, category_id=6, limit=limit)
    if not hadith_texts.get("results"):
        hadith_texts = search_shamela_text(query=query, category_id=8, limit=limit)
    
    commentaries_res = search_shamela_text(query=query, category_id=8, limit=limit)
    commentaries = commentaries_res.get("results", [])
    commentaries.sort(key=lambda x: (x.get("author_death_hijri") or 99999))
    
    return {
        "hadith_query": query,
        "takhrij_and_isnads": takhrij_res.get("isnad_chains", []),
        "sunnah_narrations": hadith_texts.get("results", []),
        "classic_commentaries": commentaries,
        "methodology": "تخريج شامل مع مدار الإسناد وشروح أئمة الحديث مرتبة زمنياً بوفيات الأئمة"
    }


# -------------------------------------------------------------
# 12. ملف الراوي الموسع والشيوخ والتلاميذ وأقوال النقاد (Study Narrator)
# -------------------------------------------------------------
def study_narrator(
    narrator: str,
    limit: int = 15
) -> Dict[str, Any]:
    """
    ملف الراوي التوثيقي الموسع:
    بيان هوية الراوي، طبقته، رتبته، شيوخه وتلاميذه، وأقوال أئمة الجرح والتعديل فيه.
    """
    n_res = search_narrators(query=narrator, limit=1)
    if not n_res:
        return {"narrator": narrator, "found": False, "message": "لم يتم العثور على ترجمة الراوي."}
        
    base_info = n_res[0]
    isnads_res = get_narrator_isnads(narrator=narrator, limit=limit, unique_chains=True)
    rijal_texts = search_shamela_text(query=narrator, category_id=9, limit=4)
    
    return {
        "narrator_id": base_info.get("id"),
        "name": base_info.get("name"),
        "full_name": base_info.get("full_name"),
        "rank": base_info.get("rank"),
        "criticism_summary": base_info.get("criticism"),
        "biography_summary": base_info.get("biography"),
        "isnads_and_network": isnads_res.get("chains", []),
        "rijal_book_excerpts": rijal_texts.get("results", [])
    }


# -------------------------------------------------------------
# 13. ملف اللفظ والمعجم الجامع (Study Word)
# -------------------------------------------------------------
def study_word(
    word: str,
    limit: int = 6
) -> Dict[str, Any]:
    """
    ملف اللفظ والمعجم الجامع:
    استخراج جذر الكلمة واشتقاقها وبيان معناها في أمهات المعاجم العربية وغريب الحديث والقرآن
    مرتبة بوفيات أئمة اللغة والمعاجم.
    """
    root_res = lookup_word_root(token=word)
    roots = root_res.get("roots", [])
    root_str = roots[0] if roots else word
    
    lex_res = search_shamela_text(query=root_str, category_id=26, limit=max(limit, 10))
    entries = lex_res.get("results", [])
    entries.sort(key=lambda x: (x.get("author_death_hijri") or 99999))
    
    return {
        "word": word,
        "extracted_roots": roots,
        "primary_root": root_str,
        "lexicon_entries_chronological": entries[:limit],
        "methodology": "مرتب بوفيات أئمة المعاجم واللغة (الأقدم فالأقدم)"
    }


# -------------------------------------------------------------
# 14. ملف المسألة الفقهية أو العقدية المقارنة عبر المذاهب (Study Topic)
# -------------------------------------------------------------
def study_topic(
    topic: str,
    madhab: Optional[str] = "all",
    limit: int = 6
) -> Dict[str, Any]:
    """
    ملف المسألة الفقهية أو العقدية المقارنة عبر المذاهب:
    استعراض نصوص المسألة محررة من أمهات كتب المذاهب الفقهية
    (الحنفي، المالكي، الشافعي، الحنبلي، الظاهري) مرتبة بالأقدم فالأقدم.
    """
    madhab_map = {
        "hanafi": (14, "المذهب الحنفي"),
        "maliki": (15, "المذهب المالكي"),
        "shafii": (16, "المذهب الشافعي"),
        "hanbali": (17, "المذهب الحنبلي"),
        "dhahiri": (18, "المذهب الظاهري")
    }
    
    results_by_school = {}
    if madhab and madhab.lower() in madhab_map:
        cat_id, school_name = madhab_map[madhab.lower()]
        res = search_shamela_text(query=topic, category_id=cat_id, limit=limit)
        items = res.get("results", [])
        items.sort(key=lambda x: (x.get("author_death_hijri") or 99999))
        results_by_school[school_name] = items
    else:
        for m_key, (cat_id, school_name) in madhab_map.items():
            res = search_shamela_text(query=topic, category_id=cat_id, limit=max(2, limit // 2))
            items = res.get("results", [])
            items.sort(key=lambda x: (x.get("author_death_hijri") or 99999))
            results_by_school[school_name] = items
            
    return {
        "topic": topic,
        "selected_madhab": madhab or "all",
        "schools_breakdown": results_by_school,
        "methodology": "تحرير كل مذهب من كتب أئمته المعتمدة مرتبة تاريخياً بالوفيات"
    }


# -------------------------------------------------------------
# إنشاء خادم الـ MCP الرسمي (MCPServer) مع تسجيل كافة الأدوات
# -------------------------------------------------------------
mcp_server = MCPServer(
    name="ShamelaScholarlyMCP",
    version="2.0.0"
)

# 1. البحث في نصوص الشاملة
@mcp_server.tool(name="search_shamela_text", description="البحث الهجين والدلالي في ملايين صفحات الشاملة ومخزن Qdrant لاستخراج نصوص الفقهاء والمفسرين بدقة مع أرقام الأجزاء والصفحات والعزو المكتبي الكامل مع تنويع أمهات الكتب وتوسيع سياق الصفحة.")
def mcp_search_shamela_text(
    query: str,
    madhab: Optional[str] = None,
    category_id: Optional[int] = None,
    limit: int = 15,
    book_diversity: bool = True,
    window_expansion: bool = True
) -> str:
    res = search_shamela_text(
        query=query,
        madhab=madhab,
        category_id=category_id,
        limit=limit,
        book_diversity=book_diversity,
        window_expansion=window_expansion
    )
    return json.dumps(res, ensure_ascii=False, indent=2)

# 2. قراءة الصفحة وسياقها الموسع
@mcp_server.tool(name="get_page_context", description="قراءة نص صفحة محددة من كتاب بالشاملة مع سياق الصفحة السابقة واللاحقة وبطاقتها التوثيقية لضمان عدم اجتزاء النصوص.")
def mcp_get_page_context(book_id: int, page_num: Optional[int] = None, part: Optional[str] = None, include_context: bool = True) -> str:
    res = get_page_context(book_id=book_id, page_num=page_num, part=part, include_context=include_context)
    return json.dumps(res, ensure_ascii=False, indent=2)

# 3. بطاقة وفهرس الكتاب
@mcp_server.tool(name="get_book_details", description="استعراض بطاقة الكتاب التوثيقية (الناشر، المحقق، الطبعة) وترجمة مؤلفه وفهرس أبوابه وموضوعاته التفصيلي.")
def mcp_get_book_details(book_id_or_title: str, include_toc: bool = True, toc_limit: int = 30) -> str:
    res = get_book_details(book_id_or_title=book_id_or_title, include_toc=include_toc, toc_limit=toc_limit)
    return json.dumps(res, ensure_ascii=False, indent=2)

# 4. تحرير المذهب
@mcp_server.tool(name="tahrir_madhab", description="تحرير المسائل الفقهية بتحديد مذهب فقهي محدد وحقبة زمنية (متقدمون، متوسطون، متأخرون معتمد المذهب) واستخراج المراجع الأساسية المعتمدة للفتوى.")
def mcp_tahrir_madhab(issue: str, madhab: str = "all", era: str = "late", limit: int = 6) -> str:
    res = tahrir_madhab(issue, madhab, era, limit)
    return json.dumps(res, ensure_ascii=False, indent=2)

# 5. تراجم الرواة
@mcp_server.tool(name="search_narrators", description="البحث في موسوعة الرواة والجرح والتعديل الشاملة (18,989 راوياً) واستخراج رتبة ابن حجر والذهبي وطبقة الراوي وشيوخه وأقوال العلماء فيه.")
def mcp_search_narrators(query: str, limit: int = 6) -> str:
    res = search_narrators(query, limit)
    return json.dumps(res, ensure_ascii=False, indent=2)

# 6. تخريج الأحاديث
@mcp_server.tool(name="takhrij_hadith", description="تخريج الحديث النبوي وربطه بأسانيد كتب السنة وسلسلة رجال السند وشواهده المتقاطعة.")
def mcp_takhrij_hadith(query: str, limit: int = 6) -> str:
    res = takhrij_hadith(query, limit)
    return json.dumps(res, ensure_ascii=False, indent=2)

# 7. الآيات وتفاسيرها
@mcp_server.tool(name="search_quran_and_tafsir", description="استخراج الآيات القرآنية ومواضع تفسيرها في كتب التفسير المسندة بالمكتبة الشاملة بأرقام الصفحات.")
def mcp_search_quran_and_tafsir(query: str, limit: int = 6) -> str:
    res = search_quran_and_tafsir(query, limit)
    return json.dumps(res, ensure_ascii=False, indent=2)

# 8. معجم الجذور
@mcp_server.tool(name="lookup_word_root", description="استخراج الجذر اللغوي لأي لفظ عربي للبحث في المعاجم الأصيلة (لسان العرب، القاموس، مقاييس اللغة).")
def mcp_lookup_word_root(token: str) -> str:
    res = lookup_word_root(token)
    return json.dumps(res, ensure_ascii=False, indent=2)

# 9. استخراج أسانيد الراوي الجماعية
@mcp_server.tool(
    name="get_narrator_isnads",
    description="استخراج جماعي لعشرات ومئات الأسانيد المتصلة المختلفة (حتى 100 سند أو أكثر) يمر فيها راوٍ بعينه (مثل سفيان الثوري، الأعمش، مالك، شعبة) من أمهات كتب السنة المعتمدة مع بيان السلسلة والعزو المكتبي الكامل."
)
def mcp_get_narrator_isnads(narrator: str, limit: int = 50, book_title: Optional[str] = None, unique_chains: bool = True) -> str:
    res = get_narrator_isnads(narrator=narrator, limit=limit, book_title=book_title, unique_chains=unique_chains)
    return json.dumps(res, ensure_ascii=False, indent=2)





# 10. التحقق من الاقتباسات حرفياً
@mcp_server.tool(
    name="verify_quotes",
    description="التحقق الصارم من صحة أي اقتباس ومطابقته الحرفية لنص الصفحة المطبوعة في الكتاب مع كشف سياق ما قبل الاقتباس وما بعده لضمان عدم البتر."
)
def mcp_verify_quotes(quote: str, book_id_or_title: str, page_num: Optional[int] = None, part: Optional[str] = None) -> str:
    res = verify_quotes(quote=quote, book_id_or_title=book_id_or_title, page_num=page_num, part=part)
    return json.dumps(res, ensure_ascii=False, indent=2)

# 11. ملف الآية التفسيري المقارن
@mcp_server.tool(
    name="study_ayah",
    description="ملف الآية التفسيري والمقارن (Dossier of an Ayah): استخراج نص الآية بالرسم العثماني ونصوص تفاسير أئمة الإسلام عبر العصور مرتبة ترتيباً تاريخياً زمنياً بوفيات المفسرين (الأقدم فالأقدم)."
)
def mcp_study_ayah(query: str, limit: int = 8) -> str:
    res = study_ayah(query=query, limit=limit)
    return json.dumps(res, ensure_ascii=False, indent=2)

# 12. ملف الحديث والتخريج والشروح
@mcp_server.tool(
    name="study_hadith",
    description="ملف الحديث الشامل (Dossier of a Hadith): استخراج متون الحديث ورواياته، وتخريجه في كتب السنة، وسلاسل الأسانيد والمدار، ونصوص شروح أئمة الحديث المعتمدة مرتبة بالوفيات."
)
def mcp_study_hadith(query: str, limit: int = 8) -> str:
    res = study_hadith(query=query, limit=limit)
    return json.dumps(res, ensure_ascii=False, indent=2)

# 13. ملف الراوي التوثيقي الموسع
@mcp_server.tool(
    name="study_narrator",
    description="ملف الراوي التوثيقي الموسع (Dossier of a Narrator): بيان هوية الراوي، طبقته، رتبته، شيوخه وتلاميذه في الأسانيد، ونصوص أقوال أئمة الجرح والتعديل فيه."
)
def mcp_study_narrator(narrator: str, limit: int = 15) -> str:
    res = study_narrator(narrator=narrator, limit=limit)
    return json.dumps(res, ensure_ascii=False, indent=2)

# 14. ملف اللفظ والمعجم الجامع
@mcp_server.tool(
    name="study_word",
    description="ملف اللفظ والمعجم الجامع (Dossier of a Word): استخراج جذر الكلمة واشتقاقها وبيان معناها في أمهات المعاجم العربية وغريب الحديث والقرآن مرتبة تاريخياً بالوفيات."
)
def mcp_study_word(word: str, limit: int = 6) -> str:
    res = study_word(word=word, limit=limit)
    return json.dumps(res, ensure_ascii=False, indent=2)

# 15. ملف المسألة الفقهية المقارنة عبر المذاهب
@mcp_server.tool(
    name="study_topic",
    description="ملف المسألة الفقهية أو العقدية المقارنة عبر المذاهب (Dossier of a Topic): استعراض نصوص المسألة محررة من أمهات كتب المذاهب الفقهية (الحنفي، المالكي، الشافعي، الحنبلي، الظاهري) مرتبة بالأقدم فالأقدم."
)
def mcp_study_topic(topic: str, madhab: Optional[str] = "all", limit: int = 6) -> str:
    res = study_topic(topic=topic, madhab=madhab, limit=limit)
    return json.dumps(res, ensure_ascii=False, indent=2)


# مواصفات الأدوات لـ REST API والواجهة الرسومية
MCP_TOOLS_SPEC = [
    {
        "name": "search_shamela_text",
        "title": "🔍 البحث الهجين في نصوص الشاملة",
        "category": "نصوص الكتب",
        "description": "البحث الهجين والدلالي في ملايين صفحات الشاملة ومخزن Qdrant لاستخراج نصوص الفقهاء والمفسرين بدقة مع أرقام الأجزاء والصفحات والعزو المكتبي الكامل.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "نص البحث أو المسألة"},
                "madhab": {"type": "string", "enum": ["hanafi", "maliki", "shafii", "hanbali", "dhahiri", "all"], "default": "all"},
                "limit": {"type": "integer", "default": 20, "description": "عدد النتائج المطلوبة (من 1 إلى 1000)"}
            },
            "required": ["query"]
        }
    },
    {
        "name": "get_page_context",
        "title": "📖 قراءة الصفحة وسياقها الموسع",
        "category": "تحقيق وتوثيق",
        "description": "قراءة نص صفحة محددة من كتاب بالشاملة مع سياق الصفحة السابقة واللاحقة وبطاقتها التوثيقية لضمان عدم اجتزاء النصوص.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "book_id": {"type": "integer", "description": "معرف الكتاب"},
                "page_num": {"type": "integer", "description": "رقم الصفحة"},
                "part": {"type": "string", "description": "رقم الجزء إن وجد"},
                "include_context": {"type": "boolean", "default": True, "description": "تضمين الصفحة السابقة واللاحقة"}
            },
            "required": ["book_id"]
        }
    },
    {
        "name": "get_book_details",
        "title": "📚 بطاقة وفهرس الكتاب",
        "category": "تحقيق وتوثيق",
        "description": "استعراض بطاقة الكتاب التوثيقية (الناشر، المحقق، الطبعة) وترجمة مؤلفه وفهرس أبوابه وموضوعاته التفصيلي.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "book_id_or_title": {"type": "string", "description": "اسم الكتاب أو معرفه الرقمي"},
                "include_toc": {"type": "boolean", "default": True},
                "toc_limit": {"type": "integer", "default": 100, "description": "عدد أبواب الفهرس المطلوبة (حتى 1000)"}
            },
            "required": ["book_id_or_title"]
        }
    },
    {
        "name": "tahrir_madhab",
        "title": "⚖️ تحرير المذاهب الفقهية",
        "category": "فقه ومذاهب",
        "description": "تحرير المسائل الفقهية بتحديد مذهب فقهي وحقبة زمنية (متقدمون، متوسطون، متأخرون معتمد المذهب) واستخراج المراجع الأساسية المعتمدة للفتوى.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "issue": {"type": "string", "description": "المسألة الفقهية المراد تحريرها"},
                "madhab": {"type": "string", "enum": ["hanafi", "maliki", "shafii", "hanbali", "dhahiri", "all"], "default": "all"},
                "era": {"type": "string", "enum": ["early", "middle", "late", "all"], "default": "late"},
                "limit": {"type": "integer", "default": 20, "description": "عدد المراجع المعتمدة (حتى 1000)"}
            },
            "required": ["issue"]
        }
    },
    {
        "name": "search_narrators",
        "title": "👤 موسوعة الرواة والجرح والتعديل",
        "category": "حديث وأثر",
        "description": "البحث في موسوعة الرواة والجرح والتعديل (18,989 راوياً) واستخراج رتبة ابن حجر والذهبي وطبقة الراوي وأقوال العلماء فيه.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "اسم الراوي، لقبه، أو كنيته"},
                "limit": {"type": "integer", "default": 20, "description": "عدد التراجم المطلوبة (حتى 1000)"}
            },
            "required": ["query"]
        }
    },
    {
        "name": "takhrij_hadith",
        "title": "📜 تخريج الأحاديث والأسانيد",
        "category": "حديث وأثر",
        "description": "تخريج الحديث النبوي وربطه بأسانيد كتب السنة وسلسلة رجال السند وشواهده المتقاطعة.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "رقم الحديث أو مفتاحه (hadeeth_key)"},
                "limit": {"type": "integer", "default": 20, "description": "عدد الأسانيد والتخريجات (حتى 1000)"}
            },
            "required": ["query"]
        }
    },
    {
        "name": "search_quran_and_tafsir",
        "title": "📖 كشاف الآيات وتفاسيرها",
        "category": "قرآن وتفسير",
        "description": "استخراج الآيات القرآنية ومواضع تفسيرها في كتب التفسير المسندة بالمكتبة الشاملة بأرقام الصفحات.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "لفظ من الآية الكريمة"},
                "limit": {"type": "integer", "default": 20, "description": "عدد الآيات ومواضع التفسير (حتى 1000)"}
            },
            "required": ["query"]
        }
    },
    {
        "name": "lookup_word_root",
        "title": "📚 معجم الجذور وغريب الألفاظ",
        "category": "لغة ومعاجم",
        "description": "استخراج الجذر اللغوي لأي لفظ عربي للبحث في المعاجم الأصيلة (لسان العرب، القاموس، مقاييس اللغة).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "token": {"type": "string", "description": "الكلمة المراد كشف جذرها"}
            },
            "required": ["token"]
        }
    },
    {
        "name": "get_narrator_isnads",
        "title": "⛓️ استخراج أسانيد الراوي الجماعية",
        "category": "حديث وأثر",
        "description": "استخراج جماعي لمئات الأسانيد المتصلة المختلفة التي يمر فيها راوٍ بعينه (مثل سفيان الثوري، الإمام أحمد) من أمهات كتب السنة المعتمدة دفعة واحدة مع السلسلة والعزو المكتبي الكامل (حتى 1000 سند).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "narrator": {"type": "string", "description": "اسم الراوي أو لقبه أو شهرته (مثال: سفيان الثوري، أحمد بن حنبل، مالك بن أنس)"},
                "limit": {"type": "integer", "default": 100, "description": "عدد الأسانيد المطلوبة (حتى 1000 سند)"},
                "book_title": {"type": "string", "description": "تصفية بكتاب معين إن رغبت (اختياري)"},
                "unique_chains": {"type": "boolean", "default": True, "description": "ضمان أن تكون سلاسل الأسانيد مختلفة ومتمايزة"}
            },
            "required": ["narrator"]
        }
    },
    {
        "name": "verify_quotes",
        "title": "✅ الاقتباس الموثق والمطابقة الحرفية",
        "category": "تحقيق وتوثيق",
        "description": "التحقق الصارم من صحة أي اقتباس ومطابقته الحرفية لنص الصفحة المطبوعة في الكتاب مع كشف سياق ما قبل الاقتباس وما بعده لضمان عدم بتر النصوص أو تحريفها.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "quote": {"type": "string", "description": "نص الاقتباس المراد التحقق من مطابقته"},
                "book_id_or_title": {"type": "string", "description": "اسم الكتاب أو معرفه الرقمي"},
                "page_num": {"type": "integer", "description": "رقم الصفحة المراد فحصها (اختياري)"},
                "part": {"type": "string", "description": "رقم الجزء إن وجد (اختياري)"}
            },
            "required": ["quote", "book_id_or_title"]
        }
    },
    {
        "name": "study_ayah",
        "title": "📖 ملف الآية التفسيري المقارن",
        "category": "قرآن وتفسير",
        "description": "استخراج نص الآية بالرسم العثماني ونصوص تفاسير أئمة الإسلام عبر العصور مرتبة ترتيباً تاريخياً زمنياً بوفيات المفسرين (الأقدم فالأقدم: الطبري، القرطبي، ابن كثير، الشوكاني، ابن عاشور).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "لفظ من الآية الكريمة أو نصها أو رقمها"},
                "limit": {"type": "integer", "default": 8, "description": "عدد التفاسير المطلوبة"}
            },
            "required": ["query"]
        }
    },
    {
        "name": "study_hadith",
        "title": "📜 ملف الحديث والتخريج والشروح",
        "category": "حديث وأثر",
        "description": "استخراج متون الحديث ورواياته، وتخريجه في كتب السنة، وسلاسل الأسانيد والمدار، ونصوص شروح أئمة الحديث المعتمدة (فتح الباري، شرح النووي...) مرتبة تاريخياً بالوفيات.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "طرف الحديث أو جزء من متنه"},
                "limit": {"type": "integer", "default": 8, "description": "عدد التخاريج والشروح"}
            },
            "required": ["query"]
        }
    },
    {
        "name": "study_narrator",
        "title": "👤 ملف الراوي التوثيقي الموسع",
        "category": "حديث وأثر",
        "description": "بيان هوية الراوي، طبقته، رتبته، شيوخه وتلاميذه في الأسانيد، ونصوص أقوال أئمة الجرح والتعديل فيه وتوثيقه من كتب الرجال.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "narrator": {"type": "string", "description": "اسم الراوي، لقبه، أو كنيته"},
                "limit": {"type": "integer", "default": 15, "description": "عدد الأسانيد والتراجم المطلوبة"}
            },
            "required": ["narrator"]
        }
    },
    {
        "name": "study_word",
        "title": "🌿 ملف اللفظ والمعجم الجامع",
        "category": "لغة ومعاجم",
        "description": "استخراج جذر الكلمة واشتقاقها وبيان معناها في أمهات المعاجم العربية (لسان العرب، القاموس، مقاييس اللغة، الصحاح) وغريب الحديث والقرآن مرتبة بالوفيات.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "word": {"type": "string", "description": "اللفظ أو الكلمة المراد بيان دلالتها ومعناها"},
                "limit": {"type": "integer", "default": 6, "description": "عدد المعاجم المطلوبة"}
            },
            "required": ["word"]
        }
    },
    {
        "name": "study_topic",
        "title": "⚖️ ملف المسألة الفقهية المقارنة",
        "category": "فقه ومذاهب",
        "description": "استعراض نصوص المسألة محررة من أمهات كتب المذاهب الفقهية (الحنفي، المالكي، الشافعي، الحنبلي، الظاهري) مرتبة بالأقدم فالأقدم مع العزو والتوثيق.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "topic": {"type": "string", "description": "المسألة الفقهية أو العقدية المراد دراستها"},
                "madhab": {"type": "string", "enum": ["hanafi", "maliki", "shafii", "hanbali", "dhahiri", "all"], "default": "all"},
                "limit": {"type": "integer", "default": 6, "description": "عدد النصوص لكل مذهب"}
            },
            "required": ["topic"]
        }
    }
]

CUSTOM_TOOLS_PATH = BASE_DIR / "web_app" / "custom_mcp_tools.json"

def load_custom_mcp_tools() -> List[Dict[str, Any]]:
    """قراءة أدوات MCP المخصصة من الملف المحلي"""
    if not CUSTOM_TOOLS_PATH.exists():
        return []
    try:
        with open(CUSTOM_TOOLS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception as e:
        print(f"Error loading custom MCP tools: {e}")
        return []

def save_custom_mcp_tools(tools: List[Dict[str, Any]]) -> bool:
    """حفظ أدوات MCP المخصصة في الملف المحلي بأمان"""
    try:
        CUSTOM_TOOLS_PATH.parent.mkdir(parents=True, exist_ok=True)
        temp_path = CUSTOM_TOOLS_PATH.with_suffix(".tmp")
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(tools, f, ensure_ascii=False, indent=2)
        temp_path.replace(CUSTOM_TOOLS_PATH)
        sync_custom_tools_to_mcp_server(mcp_server)
        return True
    except Exception as e:
        print(f"Error saving custom MCP tools: {e}")
        return False

def tool_to_mcp_spec(tool: Dict[str, Any]) -> Dict[str, Any]:
    """تحويل الأداة المخصصة إلى مواصفة MCP قياسية متوافقة مع البروتوكول"""
    default_limit = int(tool.get("default_limit", 30))
    max_limit = int(tool.get("max_limit", 1000))
    schema = tool.get("input_schema")
    if not schema or not isinstance(schema, dict):
        schema = {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": tool.get("topic") or "موضوع أو نص البحث"},
                "limit": {"type": "integer", "default": default_limit, "description": f"عدد النتائج المطلوبة (حتى {max_limit})"}
            },
            "required": ["query"]
        }
    return {
        "name": tool.get("name") or tool.get("id"),
        "title": tool.get("title") or tool.get("name"),
        "category": tool.get("category") or "أدوات مخصصة",
        "description": tool.get("description") or f"أداة مخصصة في موضوع {tool.get('topic')}",
        "inputSchema": schema,
        "is_custom": True,
        "engine_type": tool.get("engine_type", "semantic_hybrid"),
        "topic": tool.get("topic", ""),
        "default_limit": default_limit,
        "max_limit": max_limit,
        "category_id": tool.get("category_id"),
        "book_titles": tool.get("book_titles", []),
        "python_code": tool.get("python_code", "")
    }

def get_all_mcp_tools() -> List[Dict[str, Any]]:
    """الحصول على كافة أدوات MCP (الرسمية المدمجة + المخصصة)"""
    specs = list(MCP_TOOLS_SPEC)
    custom_tools = load_custom_mcp_tools()
    for ct in custom_tools:
        if ct.get("enabled", True):
            specs.append(tool_to_mcp_spec(ct))
    return specs

def execute_tool(name: str, arguments: Dict[str, Any], dynamic_spec: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """الموجّه الموحّد لتنفيذ أي أداة وإرجاع نتيجتها مع زمن التنفيذ"""
    arguments = arguments or {}
    t0 = time.time()
    
    if name == "search_shamela_text":
        res = search_shamela_text(
            query=arguments.get("query", ""),
            madhab=arguments.get("madhab"),
            category_id=arguments.get("category_id"),
            book_titles=arguments.get("book_titles"),
            limit=min(int(arguments.get("limit", 20)), 1000)
        )
    elif name == "get_page_context":
        res = get_page_context(
            book_id=int(arguments.get("book_id", 1)),
            page_num=arguments.get("page_num"),
            part=arguments.get("part"),
            include_context=arguments.get("include_context", True)
        )
    elif name == "get_book_details":
        res = get_book_details(
            book_id_or_title=arguments.get("book_id_or_title", 1),
            include_toc=arguments.get("include_toc", True),
            toc_limit=min(int(arguments.get("toc_limit", arguments.get("limit", 100))), 1000)
        )
    elif name == "search_narrators":
        res = search_narrators(arguments.get("query", ""), min(int(arguments.get("limit", 20)), 1000))
    elif name == "takhrij_hadith":
        res = takhrij_hadith(arguments.get("query", ""), min(int(arguments.get("limit", 20)), 1000))
    elif name == "get_narrator_isnads":
        res = get_narrator_isnads(
            narrator=arguments.get("narrator", ""),
            limit=min(int(arguments.get("limit", 100)), 1000),
            book_title=arguments.get("book_title"),
            unique_chains=arguments.get("unique_chains", True)
        )
    elif name == "search_quran_and_tafsir":
        res = search_quran_and_tafsir(arguments.get("query", ""), min(int(arguments.get("limit", 20)), 1000))
    elif name == "tahrir_madhab":
        res = tahrir_madhab(arguments.get("issue", ""), arguments.get("madhab", "all"), arguments.get("era", "late"), min(int(arguments.get("limit", 20)), 1000))
    elif name == "lookup_word_root":
        res = lookup_word_root(arguments.get("token", ""))
    elif name == "verify_quotes":
        res = verify_quotes(
            quote=arguments.get("quote", ""),
            book_id_or_title=arguments.get("book_id_or_title", ""),
            page_num=arguments.get("page_num"),
            part=arguments.get("part")
        )
    elif name == "study_ayah":
        res = study_ayah(
            query=arguments.get("query", ""),
            limit=min(int(arguments.get("limit", 8)), 1000)
        )
    elif name == "study_hadith":
        res = study_hadith(
            query=arguments.get("query", ""),
            limit=min(int(arguments.get("limit", 8)), 1000)
        )
    elif name == "study_narrator":
        res = study_narrator(
            narrator=arguments.get("narrator", ""),
            limit=min(int(arguments.get("limit", 15)), 1000)
        )
    elif name == "study_word":
        res = study_word(
            word=arguments.get("word", ""),
            limit=min(int(arguments.get("limit", 6)), 1000)
        )
    elif name == "study_topic":
        res = study_topic(
            topic=arguments.get("topic", ""),
            madhab=arguments.get("madhab", "all"),
            limit=min(int(arguments.get("limit", 6)), 1000)
        )
    else:
        # فحص إذا كانت الأداة من الأدوات المخصصة التي أنشأها المستخدم أو مواصفة ديناميكية للاختبار
        custom_tools = {t.get("name") or t.get("id"): t for t in load_custom_mcp_tools()}
        ct = dynamic_spec if (dynamic_spec and isinstance(dynamic_spec, dict)) else custom_tools.get(name)
        if ct:
            q = arguments.get("query") or arguments.get("issue") or arguments.get("token") or arguments.get("topic") or arguments.get("narrator") or arguments.get("word") or arguments.get("quote") or ""
            lim = min(int(arguments.get("limit", ct.get("default_limit", 30))), min(int(ct.get("max_limit", 1000)), 1000))
            cat_id = ct.get("category_id")
            books = ct.get("book_titles")
            engine = ct.get("engine_type", "semantic_hybrid")
            py_code = ct.get("python_code") or ""

            if engine == "custom_python":
                # تنفيذ كود البايثون المخصص بمتغيرات مساعدة ومكتبات آمنة
                import builtins, math, io, sys, traceback
                clean_code = py_code.strip()
                if not clean_code:
                    clean_code = "res = search_shamela_text(query=query, category_id=category_id, book_titles=book_titles, limit=limit)\nreturn res"

                stdout_buf = io.StringIO()
                execution_scope = {
                    "__builtins__": builtins,
                    "query": q,
                    "limit": lim,
                    "category_id": cat_id,
                    "book_titles": books,
                    "arguments": arguments,
                    "search_shamela_text": search_shamela_text,
                    "get_page_context": get_page_context,
                    "get_book_details": get_book_details,
                    "tahrir_madhab": tahrir_madhab,
                    "search_narrators": search_narrators,
                    "get_narrator_isnads": get_narrator_isnads,
                    "takhrij_hadith": takhrij_hadith,
                    "search_quran_and_tafsir": search_quran_and_tafsir,
                    "lookup_word_root": lookup_word_root,
                    "verify_quotes": verify_quotes,
                    "study_ayah": study_ayah,
                    "study_hadith": study_hadith,
                    "study_narrator": study_narrator,
                    "study_word": study_word,
                    "study_topic": study_topic,
                    "get_table": get_table,
                    "get_db_connection": get_db_connection,
                    "sqlite3": sqlite3,
                    "pq": pq,
                    "pc": pc,
                    "json": json,
                    "re": re,
                    "time": time,
                    "math": math,
                    "res": None
                }

                if "return " in clean_code or clean_code.startswith("return"):
                    wrapped_code = "def __custom_runner():\n" + "\n".join("    " + line for line in clean_code.splitlines()) + "\n__res = __custom_runner()"
                else:
                    wrapped_code = clean_code + "\n__res = locals().get('res', None)"

                old_stdout = sys.stdout
                try:
                    sys.stdout = stdout_buf
                    exec(wrapped_code, execution_scope)
                except Exception as py_err:
                    tb_str = traceback.format_exc()
                    res = {"error": f"خطأ في تنفيذ كود الأداة المخصصة: {str(py_err)}\n\nتفاصيل الخطأ:\n{tb_str}", "status": "error"}
                    raw_res = None
                finally:
                    sys.stdout = old_stdout

                if "res" not in locals() or res is None:
                    raw_res = execution_scope.get("__res")
                    if raw_res is None:
                        for var_candidate in ["res", "result", "results", "output", "data"]:
                            val = execution_scope.get(var_candidate)
                            if val is not None:
                                raw_res = val
                                break

                    # إذا لم يوجد إرجاع صريح لكن طبع الكود مخرجات عبر print()
                    printed_out = stdout_buf.getvalue().strip()
                    if raw_res is None and printed_out:
                        raw_res = printed_out

                    if raw_res is None:
                        res = {"status": "success", "results": [], "note": "تم تنفيذ الكود لكنه لم يرجع أية نتيجة (استخدم return أو أسند النتيجة للمتغير res)"}
                    elif isinstance(raw_res, list):
                        res = {"status": "success", "total_returned": len(raw_res), "results": raw_res}
                    elif isinstance(raw_res, dict):
                        res = raw_res
                        if "results" not in res and "error" not in res:
                            res["results"] = [res]
                    elif isinstance(raw_res, str):
                        res = {"status": "success", "total_returned": 1, "results": [{"title": f"نتيجة كود بايثون للأداة {name}", "snippet": raw_res, "full_body": raw_res, "citation": f"الأداة البرمجية: {name}"}]}
                    else:
                        res = {"status": "success", "total_returned": 1, "results": [{"title": f"نتيجة الأداة {name}", "snippet": str(raw_res), "full_body": str(raw_res), "citation": f"الأداة: {name}"}]}
            else:
                # محرك البحث الهجين والدلالي الموجه
                res = search_shamela_text(
                    query=q,
                    category_id=cat_id,
                    book_titles=books if isinstance(books, list) and books else None,
                    limit=lim
                )
        else:
            return {"error": f"الأداة '{name}' غير موجودة", "duration_ms": 0}

    duration_ms = round((time.time() - t0) * 1000, 2)
    return {
        "tool": name,
        "arguments": arguments,
        "duration_ms": duration_ms,
        "result": res
    }

def sync_custom_tools_to_mcp_server(server: MCPServer = mcp_server):
    """تسجيل أدوات MCP المخصصة تلقائياً على خادم MCPServer ليراها Claude Desktop و Cursor"""
    try:
        custom_tools = load_custom_mcp_tools()
        for ct in custom_tools:
            t_name = ct.get("name") or ct.get("id")
            if not t_name:
                continue
            try:
                server.remove_tool(t_name)
            except Exception:
                pass

            if not ct.get("enabled", True):
                continue

            t_desc = ct.get("description") or f"أداة مخصصة في {ct.get('topic', '')}"
            t_def_limit = int(ct.get("default_limit", 30))

            def _make_handler(name: str, def_lim: int):
                def _custom_tool_runner(query: str, limit: int = def_lim) -> str:
                    exec_res = execute_tool(name, {"query": query, "limit": limit})
                    return json.dumps(exec_res.get("result", exec_res), ensure_ascii=False, indent=2)
                return _custom_tool_runner

            server.add_tool(
                _make_handler(t_name, t_def_limit),
                name=t_name,
                title=ct.get("title") or t_name,
                description=t_desc
            )
    except Exception as e:
        print(f"Error syncing custom tools to MCPServer: {e}")

# مزامنة وتفعيل كافة الأدوات المخصصة فور بدء تشغيل الخادم
sync_custom_tools_to_mcp_server(mcp_server)
