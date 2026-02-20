import argparse
import datetime as dt
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser(description="Append an entry to memory/inbox/INDEX.md")
    ap.add_argument("saved_path", help="Path to the saved markdown file")
    ap.add_argument("--title", default="", help="Optional title")
    ap.add_argument("--source", default="", help="Optional source label")
    ap.add_argument("--index", default=str(Path("memory") / "inbox" / "INDEX.md"))
    args = ap.parse_args()

    index_path = Path(args.index)
    index_path.parent.mkdir(parents=True, exist_ok=True)

    if not index_path.exists():
        index_path.write_text("# Inbox Index\n\n", encoding="utf-8")

    now = dt.datetime.now().astimezone().isoformat(timespec="seconds")
    saved = Path(args.saved_path)
    rel = saved.as_posix()

    title = args.title.strip() or saved.stem
    source = args.source.strip()
    meta = f"{title}"
    if source:
        meta += f" | {source}"

    line = f"- {now} | {meta} -> {rel}\n"
    with index_path.open("a", encoding="utf-8") as f:
        f.write(line)

    print(str(index_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
