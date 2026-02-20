import json
import os
import time
import hashlib
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

WORKSPACE = Path(__file__).resolve().parents[2]
DATA_DIR = WORKSPACE / "data" / "intel"
SOURCES_PATH = DATA_DIR / "sources.json"
CACHE_PATH = DATA_DIR / "cache.jsonl"
HISTORY_PATH = DATA_DIR / "history.json"

BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search"


def _utc_now():
    return datetime.now(timezone.utc)


def _load_sources():
    with SOURCES_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def _load_history():
    if not HISTORY_PATH.exists():
        return {"version": 1, "updatedAt": None, "seen": {}}
    with HISTORY_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def _save_history(hist):
    hist["updatedAt"] = _utc_now().isoformat()
    HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    with HISTORY_PATH.open("w", encoding="utf-8") as f:
        json.dump(hist, f, ensure_ascii=False, indent=2)


def _key_for(url: str, title: str) -> str:
    s = (url or "") + "\n" + (title or "")
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def _brave_search(api_key: str, query: str, count: int = 5):
    headers = {
        "Accept": "application/json",
        "X-Subscription-Token": api_key,
        "User-Agent": "openclaw-intel-prefetch/1.0",
    }
    params = {
        "q": query,
        "count": str(count),
        "text_decorations": "false",
        "freshness": "pd",
    }
    r = requests.get(BRAVE_ENDPOINT, headers=headers, params=params, timeout=20)
    r.raise_for_status()
    data = r.json()
    web = (data.get("web") or {}).get("results") or []
    out = []
    for item in web:
        out.append(
            {
                "title": item.get("title"),
                "url": item.get("url"),
                "description": item.get("description"),
                "age": item.get("age"),
            }
        )
    return out


def main():
    api_key = os.environ.get("BRAVE_API_KEY")
    if not api_key:
        raise SystemExit("BRAVE_API_KEY is required (set env var; do not commit secrets).")

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    sources = _load_sources()
    hist = _load_history()
    seen = hist.setdefault("seen", {})

    now = _utc_now()
    cutoff = now - timedelta(days=14)

    # prune old
    for k in list(seen.keys()):
        try:
            ts = datetime.fromisoformat(seen[k])
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            if ts < cutoff:
                del seen[k]
        except Exception:
            # keep unknown
            pass

    added = 0

    with CACHE_PATH.open("a", encoding="utf-8") as cache_f:
        for topic in sources.get("topics", []):
            topic_id = topic.get("id")
            for q in topic.get("queries", []):
                results = _brave_search(api_key, q, count=5)
                for r in results:
                    k = _key_for(r.get("url") or "", r.get("title") or "")
                    if k in seen:
                        continue
                    record = {
                        "type": "candidate",
                        "topic": topic_id,
                        "query": q,
                        "fetchedAt": now.isoformat(),
                        "item": r,
                    }
                    cache_f.write(json.dumps(record, ensure_ascii=False) + "\n")
                    seen[k] = now.isoformat()
                    added += 1
                time.sleep(0.4)

    _save_history(hist)
    print(f"added={added}")


if __name__ == "__main__":
    main()
