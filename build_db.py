import json
import os
import sqlite3
import urllib.request

DB_FILE = "anime.db"
JSON_FILE = "anime-offline-database-minified.json"
DOWNLOAD_URL = "https://github.com/manami-project/anime-offline-database/releases/latest/download/anime-offline-database-minified.json"

def download_json():
    if os.path.exists(JSON_FILE):
        print(f"[*] Found existing '{JSON_FILE}', skipping download.")
        return
    print("[*] Downloading Manami Anime Offline Database (~40MB)...")
    req = urllib.request.Request(DOWNLOAD_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as response, open(JSON_FILE, "wb") as out_file:
        out_file.write(response.read())
    print("[+] Download complete.")

def build_sqlite_db():
    print("[*] Building local SQLite database ('anime.db')...")
    if os.path.exists(DB_FILE):
        os.remove(DB_FILE)

    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE anime (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            synonyms TEXT,
            type TEXT,
            episodes INTEGER,
            status TEXT,
            season TEXT,
            year INTEGER,
            score REAL,
            image TEXT,
            tags TEXT
        )
    """)

    cur.execute("CREATE INDEX idx_score ON anime(score DESC)")
    cur.execute("CREATE INDEX idx_year ON anime(year DESC, score DESC)")
    cur.execute("CREATE INDEX idx_title ON anime(title COLLATE NOCASE)")

    with open(JSON_FILE, "r", encoding="utf-8") as f:
        payload = json.load(f)

    entries = payload.get("data", [])
    rows_to_insert = []

    for item in entries:
        title = item.get("title", "Untitled")
        synonyms_list = item.get("synonyms", [])
        synonyms_str = " | ".join(synonyms_list[:6])
        anime_type = item.get("type", "TV")
        episodes = item.get("episodes", 0)
        status = item.get("status", "UNKNOWN")
        
        anime_season = item.get("animeSeason", {})
        season = anime_season.get("season", "UNDEFINED")
        year = anime_season.get("year") or 0

        score_obj = item.get("score", {})
        raw_score = score_obj.get("arithmeticMean") or score_obj.get("median") or 0.0
        score = round(float(raw_score), 2)

        image = item.get("picture") or item.get("thumbnail") or ""
        tags_list = item.get("tags", [])
        tags_str = ", ".join(tags_list[:10])

        rows_to_insert.append((
            title, synonyms_str, anime_type, episodes, status,
            season, year, score, image, tags_str
        ))

    cur.executemany("""
        INSERT INTO anime (title, synonyms, type, episodes, status, season, year, score, image, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, rows_to_insert)

    conn.commit()
    conn.close()
    print(f"[+] Successfully indexed {len(rows_to_insert):,} anime entries into '{DB_FILE}'!")

if __name__ == "__main__":
    download_json()
    build_sqlite_db()