import json
import sqlite3
import urllib.parse
from http.server import SimpleHTTPRequestHandler, HTTPServer

DB_FILE = "anime.db"
PORT = 8000

def query_db(sql, params=()):
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute(sql, params)
    rows = [dict(row) for row in cur.fetchall()]
    conn.close()
    return rows

def format_row(r):
    eps = f"{r['episodes']} EPS" if r["episodes"] else "Ongoing / Movie"
    year_str = f" • {r['year']}" if r["year"] else ""
    tags_preview = r["tags"] if r["tags"] else "No tags recorded."
    synonyms_preview = r["synonyms"].split(" | ")[0] if r["synonyms"] else r["title"]

    return {
        "mal_id": r["id"],
        "title": r["title"],
        "title_japanese": synonyms_preview,
        "image": r["image"] if r["image"] else "https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=800&q=80",
        "score": f"{r['score']:.2f}" if r["score"] > 0 else "N/A",
        "meta": f"{r['type']} • {eps}{year_str}",
        "synopsis": f"Genres & Tags: {tags_preview}. Status: {r['status']} ({r['season']} {r['year'] or 'N/A'})."
    }

class LocalAnimeHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        if parsed.path == "/api/feed":
            mode = params.get("mode", ["top"])[0]
            if mode == "top":
                rows = query_db("SELECT * FROM anime WHERE type != 'UNKNOWN' AND score > 0 ORDER BY score DESC LIMIT 50")
            elif mode == "seasonal":
                rows = query_db("SELECT * FROM anime WHERE year >= 2024 AND score > 0 ORDER BY year DESC, score DESC LIMIT 50")
            else:
                rows = query_db("SELECT * FROM anime WHERE score >= 6.5 ORDER BY RANDOM() LIMIT 25")
            self.send_json([format_row(r) for r in rows])
            return

        if parsed.path == "/api/search":
            q = params.get("q", [""])[0].strip()
            if not q:
                self.send_json([])
                return
            like_q = f"%{q}%"
            rows = query_db("""
                SELECT * FROM anime
                WHERE title LIKE ? OR synonyms LIKE ? OR tags LIKE ?
                ORDER BY score DESC
                LIMIT 20
            """, (like_q, like_q, like_q))
            self.send_json([format_row(r) for r in rows])
            return

        return super().do_GET()

    def send_json(self, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

if __name__ == "__main__":
    print(f"====================================================")
    print(f" AKIRA // ARCHIVE Local Offline Server Running")
    print(f" Open in browser: http://localhost:{PORT}")
    print(f"====================================================")
    server = HTTPServer(("127.0.0.1", PORT), LocalAnimeHandler)
    server.serve_forever()