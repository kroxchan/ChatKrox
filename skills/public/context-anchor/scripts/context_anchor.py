import argparse
import datetime as dt
import re
from pathlib import Path


def slugify(s: str) -> str:
    s = s.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "anchor"


def ensure_index(index_path: Path, slug: str, title: str, anchor_path: Path) -> None:
    index_path.parent.mkdir(parents=True, exist_ok=True)
    if not index_path.exists():
        index_path.write_text("# Context Anchors Index\n\n", encoding="utf-8")

    rel = anchor_path.as_posix()
    now = dt.datetime.now().astimezone().isoformat(timespec="seconds")

    lines = index_path.read_text(encoding="utf-8").splitlines()
    entry_prefix = f"- [{slug}] "
    lines = [ln for ln in lines if not ln.startswith(entry_prefix)]
    lines.append(f"- [{slug}] {title} ({now}) -> {rel}")
    index_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_anchor(anchor_path: Path, title: str, body: str) -> None:
    anchor_path.parent.mkdir(parents=True, exist_ok=True)
    now = dt.datetime.now().astimezone().isoformat(timespec="seconds")
    text = "\n".join(
        [
            "---",
            f"title: {title}",
            f"updated_at: {now}",
            "---",
            "",
            body.strip() + "\n",
        ]
    )
    anchor_path.write_text(text, encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description="Persist short context anchors to disk.")
    ap.add_argument("name", help="Anchor slug or title")
    ap.add_argument("--title", default=None, help="Human title")
    ap.add_argument("--body", default=None, help="Anchor body (markdown)")
    ap.add_argument("--body-file", default=None, help="Read body from file")
    ap.add_argument("--dir", default=str(Path("memory") / "anchors"), help="Anchor directory")
    ap.add_argument("--index", action="store_true", help="Update INDEX.md")
    args = ap.parse_args()

    title = args.title or args.name
    slug = slugify(args.name)
    anchor_dir = Path(args.dir)
    anchor_path = anchor_dir / f"{slug}.md"

    body = args.body
    if body is None and args.body_file:
        body = Path(args.body_file).read_text(encoding="utf-8")
    if body is None:
        raise SystemExit("Need --body or --body-file")

    write_anchor(anchor_path, title, body)

    if args.index:
        ensure_index(anchor_dir / "INDEX.md", slug, title, anchor_path)

    print(str(anchor_path))


if __name__ == "__main__":
    main()
