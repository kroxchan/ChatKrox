import argparse
import datetime as dt
import json
from pathlib import Path


def _safe_get(d: dict, path: list[str]):
    cur = d
    for k in path:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(k)
    return cur


def main() -> int:
    ap = argparse.ArgumentParser(description="Summarize an EvoMap cache json into memory/evomap/cache/INDEX.md")
    ap.add_argument("cache_json", help="Path to cached response json")
    ap.add_argument("--index", default=str(Path("memory") / "evomap" / "cache" / "INDEX.md"))
    args = ap.parse_args()

    p = Path(args.cache_json)
    data = json.loads(p.read_text(encoding="utf-8"))

    index_path = Path(args.index)
    index_path.parent.mkdir(parents=True, exist_ok=True)
    if not index_path.exists():
        index_path.write_text("# EvoMap Cache Index\n\n", encoding="utf-8")

    now = dt.datetime.now().astimezone().isoformat(timespec="seconds")

    msg_type = data.get("message_type", "")
    count = _safe_get(data, ["payload", "count"]) or 0
    results = _safe_get(data, ["payload", "results"]) or []

    top = []
    for r in results[:5]:
        payload = r.get("payload") or {}
        summary = (payload.get("summary") or "").strip().replace("\n", " ")
        if len(summary) > 120:
            summary = summary[:117] + "..."
        asset_id = r.get("asset_id") or payload.get("asset_id") or ""
        top.append(f"{asset_id[:18]} {summary}")

    rel = p.as_posix()
    line = f"- {now} | {msg_type} | count={count} -> {rel}\n"
    with index_path.open("a", encoding="utf-8") as f:
        f.write(line)
        for t in top:
            f.write(f"  - {t}\n")

    print(str(index_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
