import re
import json
from datetime import datetime, timedelta
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parents[2]
MEMORY_MD = WORKSPACE / "MEMORY.md"
OUT_MD = WORKSPACE / "MEMORY.md"
ARCHIVE_DIR = WORKSPACE / "memory" / "archive"

TAG_RE = re.compile(
    r"^\s*-\s*\[(?P<tag>P0|P1|P2)(?:\|expire:(?P<expire>\d{4}-\d{2}-\d{2}))?\]\s*(?P<body>.*)$"
)


def parse_date(s: str):
    return datetime.strptime(s, "%Y-%m-%d").date()


def main():
    if not MEMORY_MD.exists():
        print("skip: MEMORY.md not found")
        return

    today = datetime.now().date()
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    archive_path = ARCHIVE_DIR / f"MEMORY-archive-{today.isoformat()}.md"

    lines = MEMORY_MD.read_text(encoding="utf-8", errors="replace").splitlines(True)

    kept = []
    archived = []

    for line in lines:
        m = TAG_RE.match(line)
        if not m:
            kept.append(line)
            continue

        tag = m.group("tag")
        expire = m.group("expire")

        if tag == "P0":
            kept.append(line)
            continue

        if not expire:
            kept.append(line)
            continue

        try:
            exp = parse_date(expire)
        except Exception:
            kept.append(line)
            continue

        if exp < today:
            archived.append(line)
        else:
            kept.append(line)

    if archived:
        header = (
            f"# Archived from MEMORY.md ({today.isoformat()})\n\n"
            "Entries below were archived by janitor because they were expired.\n\n"
        )
        if not archive_path.exists():
            archive_path.write_text(header, encoding="utf-8")
        with archive_path.open("a", encoding="utf-8") as f:
            f.writelines(archived)

        OUT_MD.write_text("".join(kept), encoding="utf-8")
        print(f"archived={len(archived)} -> {archive_path}")
    else:
        print("archived=0")


if __name__ == "__main__":
    main()
