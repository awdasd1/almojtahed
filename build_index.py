#!/usr/bin/env python3
"""
build_index.py
إنشاء قاعدة بيانات خفيفة وسريعة (SQLite) لفهرسة بيانات المكتبة الشاملة والربط المباشر مع Qdrant
"""
import os
import glob
import sqlite3
import pyarrow.parquet as pq
from pathlib import Path
import time

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "shamela4_data"
DB_PATH = BASE_DIR / "shamela_index.db"

def main():
    t0 = time.time()
    print("Building Shamela SQLite Catalog Index...")
    
    # Connect to SQLite
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    cur.execute("DROP TABLE IF EXISTS books")
    cur.execute("DROP TABLE IF EXISTS categories")
    
    cur.execute("""
    CREATE TABLE categories (
        category_id INTEGER PRIMARY KEY,
        category_name_ar TEXT,
        folder_name TEXT,
        book_count INTEGER DEFAULT 0
    )
    """)
    
    cur.execute("""
    CREATE TABLE books (
        book_id INTEGER PRIMARY KEY,
        shamela_id INTEGER,
        title_ar TEXT,
        category_id INTEGER,
        category_name_ar TEXT,
        main_author_id INTEGER,
        main_author_name_ar TEXT,
        main_author_death_hijri INTEGER,
        volume_count_observed INTEGER,
        betaka_text TEXT,
        rel_path TEXT,
        FOREIGN KEY (category_id) REFERENCES categories(category_id)
    )
    """)
    
    cur.execute("CREATE INDEX idx_books_title ON books(title_ar)")
    cur.execute("CREATE INDEX idx_books_category ON books(category_id)")
    cur.execute("CREATE INDEX idx_books_author ON books(main_author_name_ar)")

    # Read categories parquet
    cats_table = pq.read_table(DATA_DIR / "_meta" / "categories.parquet").to_pandas()
    
    # Map disk category folders:
    cat_folders = {}
    for d in glob.glob(str(DATA_DIR / "[0-9]*")):
        bname = os.path.basename(d)
        cid = int(bname.split("__")[0])
        cat_folders[cid] = bname

    for _, row in cats_table.iterrows():
        cid = int(row["id"])
        cname = row["name_ar"]
        folder = cat_folders.get(cid, "")
        cur.execute(
            "INSERT INTO categories (category_id, category_name_ar, folder_name) VALUES (?, ?, ?)",
            (cid, cname, folder)
        )

    # Map disk book folders
    book_folders = {}
    for f in glob.glob(str(DATA_DIR / "[0-9]*/*")):
        bname = os.path.basename(f)
        if "__" in bname:
            bid_part = bname.split("__")[0]
            if bid_part.isdigit():
                rel = os.path.relpath(f, BASE_DIR)
                book_folders[int(bid_part)] = rel

    # Read books parquet
    books_table = pq.read_table(DATA_DIR / "_meta" / "book_metadata.parquet").to_pandas()
    
    book_rows = []
    cat_counts = {}
    for _, row in books_table.iterrows():
        bid = int(row["book_id"])
        cid = int(row["category_id"]) if row["category_id"] is not None else 0
        rel_path = book_folders.get(bid, "")
        cat_counts[cid] = cat_counts.get(cid, 0) + 1
        
        book_rows.append((
            bid,
            int(row["shamela_id"]) if row["shamela_id"] is not None else None,
            str(row["title_ar"] or ""),
            cid,
            str(row["category_name_ar"] or ""),
            int(row["main_author_id"]) if row["main_author_id"] is not None else None,
            str(row["main_author_name_ar"] or ""),
            int(row["main_author_death_hijri"]) if row["main_author_death_hijri"] is not None and not str(row["main_author_death_hijri"]).startswith("None") and str(row["main_author_death_hijri"]).isdigit() else None,
            int(row["volume_count_observed"]) if row["volume_count_observed"] is not None else 1,
            str(row["betaka_text"] or ""),
            rel_path
        ))

    cur.executemany("""
    INSERT INTO books (
        book_id, shamela_id, title_ar, category_id, category_name_ar,
        main_author_id, main_author_name_ar, main_author_death_hijri,
        volume_count_observed, betaka_text, rel_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, book_rows)

    for cid, cnt in cat_counts.items():
        cur.execute("UPDATE categories SET book_count = ? WHERE category_id = ?", (cnt, cid))

    conn.commit()
    conn.close()
    print(f"Successfully indexed {len(book_rows)} books and {len(cats_table)} categories into {DB_PATH.name} in {time.time()-t0:.2f}s!")

if __name__ == "__main__":
    main()
