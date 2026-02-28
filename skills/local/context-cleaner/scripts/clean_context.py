#!/usr/bin/env python3
"""OpenClaw context cleaner.

- Prune sessions older than N days (default 7)
  - Keep sessions whose key contains 'important' or 'memory'
- Extract highlights from memory/YYYY-MM-DD.md older than M days (default 30)
  - Append extracted highlights to MEMORY.md
  - Delete processed memory files

This script is designed to run from an OpenClaw cron agent turn, but it can
also be run manually.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple


DATE_FILE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})\.md$")


@dataclass
class SessionRow:
    key: str
    updated_at_ms: Optional[int]


def _now_local() -> dt.datetime:
    # Use local time; OpenClaw runtime host locale is fine for date thresholds.
    return dt.datetime.now().astimezone()


def _run_openclaw_sessions_json() -> Dict[str, Any]:
    exe = shutil.which("openclaw") or shutil.which("openclaw.cmd") or shutil.which("openclaw.exe")
    if not exe:
        raise RuntimeError("openclaw CLI not found in PATH (tried openclaw/openclaw.cmd/openclaw.exe)")

    try:
        cp = subprocess.run(
            [exe, "sessions", "--json"],
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as e:
        raise RuntimeError(
            f"openclaw sessions --json failed (code={e.returncode}): {e.stderr.strip()}"
        ) from e

    try:
        return json.loads(cp.stdout)
    except json.JSONDecodeError as e:
        raise RuntimeError("Failed to parse JSON from openclaw sessions --json") from e


def _load_session_store(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _write_session_store(path: Path, data: Dict[str, Any], *, dry_run: bool) -> None:
    if dry_run:
        return

    ts = _now_local().strftime("%Y%m%d-%H%M%S")
    backup = path.with_suffix(path.suffix + f".{ts}.bak")
    shutil.copy2(path, backup)

    # Keep formatting stable and ASCII-friendly for maximum portability.
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=True)
        f.write("\n")


def _iter_sessions_from_store(store: Dict[str, Any]) -> Iterable[SessionRow]:
    for key, value in store.items():
        if not isinstance(value, dict):
            continue
        updated = value.get("updatedAt")
        if isinstance(updated, int):
            updated_ms: Optional[int] = updated
        else:
            updated_ms = None
        yield SessionRow(key=key, updated_at_ms=updated_ms)


def _should_keep_session(key: str) -> bool:
    lk = key.lower()
    return ("important" in lk) or ("memory" in lk)


def prune_sessions(*, keep_days: int, dry_run: bool) -> Tuple[int, List[str], Optional[Path]]:
    """Return (deleted_count, kept_important_keys, store_path)."""

    info = _run_openclaw_sessions_json()
    store_path_raw = info.get("path")
    if not isinstance(store_path_raw, str) or not store_path_raw:
        raise RuntimeError("openclaw sessions --json did not include a valid 'path'")

    store_path = Path(store_path_raw)
    if not store_path.exists():
        raise RuntimeError(f"Session store not found: {store_path}")

    store = _load_session_store(store_path)

    now = _now_local()
    cutoff = now - dt.timedelta(days=keep_days)
    cutoff_ms = int(cutoff.timestamp() * 1000)

    deleted = 0
    kept_important: List[str] = []

    new_store: Dict[str, Any] = {}
    for row in _iter_sessions_from_store(store):
        if _should_keep_session(row.key):
            kept_important.append(row.key)
            new_store[row.key] = store.get(row.key)
            continue

        # If updatedAt is missing, keep it (conservative).
        if row.updated_at_ms is None:
            new_store[row.key] = store.get(row.key)
            continue

        if row.updated_at_ms < cutoff_ms:
            deleted += 1
            continue

        new_store[row.key] = store.get(row.key)

    if deleted > 0:
        _write_session_store(store_path, new_store, dry_run=dry_run)

    kept_important.sort()
    return deleted, kept_important, store_path


def _parse_date_from_filename(name: str) -> Optional[dt.date]:
    m = DATE_FILE_RE.match(name)
    if not m:
        return None
    try:
        return dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def _extract_highlights(text: str) -> List[str]:
    """Heuristic extractor.

    Preference order:
    1) Content under headings containing 精华/要点/总结/反思/行动
    2) Bullet-like lines
    """

    lines = text.splitlines()

    heading_re = re.compile(r"^#{1,6}\s+(.+?)\s*$")
    target_kw = re.compile(r"(精华|要点|总结|回顾|反思|结论|行动|改进|学到)")

    # Find first matching heading and capture until next heading of same-or-higher level.
    for i, line in enumerate(lines):
        hm = heading_re.match(line)
        if not hm:
            continue
        title = hm.group(1)
        if not target_kw.search(title):
            continue

        level = len(line) - len(line.lstrip("#"))
        collected: List[str] = []
        for j in range(i + 1, len(lines)):
            nxt = lines[j]
            nxt_hm = heading_re.match(nxt)
            if nxt_hm:
                nxt_level = len(nxt) - len(nxt.lstrip("#"))
                if nxt_level <= level:
                    break
            s = nxt.strip()
            if not s:
                continue
            collected.append(s)

        cleaned = _cleanup_highlights(collected)
        if cleaned:
            return cleaned[:30]

    # Fallback: bullet-ish lines.
    bullets: List[str] = []
    for line in lines:
        s = line.strip()
        if not s:
            continue
        if s.startswith(("- ", "* ", "• ", "1. ", "2. ", "3. ")):
            bullets.append(s)

    bullets = _cleanup_highlights(bullets)
    return bullets[:20]


def _cleanup_highlights(items: List[str]) -> List[str]:
    out: List[str] = []
    seen = set()
    for it in items:
        s = it.strip()
        if not s:
            continue
        # Normalize common bullet prefixes.
        s = re.sub(r"^[-*•]\s+", "", s)
        s = re.sub(r"^\d+\.\s+", "", s)
        if len(s) < 2:
            continue
        if s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out


def archive_memory(*, memory_days: int, dry_run: bool) -> Tuple[int, int, List[str]]:
    """Return (processed_files, extracted_items, deleted_files)."""

    repo_root = Path(__file__).resolve().parents[4]
    memory_dir = repo_root / "memory"
    memory_md = repo_root / "MEMORY.md"

    if not memory_dir.exists():
        return 0, 0, []

    now = _now_local().date()
    cutoff = now - dt.timedelta(days=memory_days)

    processed = 0
    extracted_total = 0
    deleted_files: List[str] = []

    candidates: List[Tuple[dt.date, Path]] = []
    for p in memory_dir.iterdir():
        if not p.is_file():
            continue
        d = _parse_date_from_filename(p.name)
        if d is None:
            continue
        if d > cutoff:
            continue
        candidates.append((d, p))

    candidates.sort(key=lambda t: t[0])

    for d, p in candidates:
        text = p.read_text(encoding="utf-8")
        highlights = _extract_highlights(text)

        processed += 1

        if highlights:
            extracted_total += len(highlights)
            block_lines: List[str] = []
            block_lines.append("")
            block_lines.append(f"## Archive {d.isoformat()}")
            for h in highlights:
                block_lines.append(f"- {h}")
            block_lines.append("")

            if not dry_run:
                memory_md.parent.mkdir(parents=True, exist_ok=True)
                with memory_md.open("a", encoding="utf-8") as f:
                    f.write("\n".join(block_lines))

        if not dry_run:
            p.unlink()
        deleted_files.append(str(p.relative_to(repo_root)).replace("\\", "/"))

    return processed, extracted_total, deleted_files


def main(argv: List[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="Print actions only; no changes")
    ap.add_argument("--sessions-days", type=int, default=7)
    ap.add_argument("--memory-days", type=int, default=30)
    ap.add_argument("--new-session", action="store_true", default=True, help="Create new session after cleanup (default: True)")
    args = ap.parse_args(argv)

    report_lines: List[str] = []

    deleted_sessions, kept_important, store_path = prune_sessions(
        keep_days=args.sessions_days,
        dry_run=args.dry_run,
    )

    processed_files, extracted_items, deleted_memory_files = archive_memory(
        memory_days=args.memory_days,
        dry_run=args.dry_run,
    )

    report_lines.append("Context cleaner report")
    report_lines.append(f"- dryRun: {bool(args.dry_run)}")
    report_lines.append(f"- sessionsStore: {store_path}")
    report_lines.append(f"- sessionsDeleted: {deleted_sessions}")
    report_lines.append(f"- importantSessionsKept: {len(kept_important)}")
    if kept_important:
        # Limit to avoid overly-long cron logs.
        shown = kept_important[:50]
        report_lines.append("- importantSessionKeys:")
        for k in shown:
            report_lines.append(f"  - {k}")
        if len(kept_important) > len(shown):
            report_lines.append(f"  - ... (+{len(kept_important) - len(shown)} more)")

    report_lines.append(f"- memoryFilesProcessed: {processed_files}")
    report_lines.append(f"- memoryHighlightsExtracted: {extracted_items}")
    report_lines.append(f"- memoryFilesDeleted: {len(deleted_memory_files)}")
    if deleted_memory_files:
        shown = deleted_memory_files[:50]
        report_lines.append("- memoryFiles:")
        for p in shown:
            report_lines.append(f"  - {p}")
        if len(deleted_memory_files) > len(shown):
            report_lines.append(f"  - ... (+{len(deleted_memory_files) - len(shown)} more)")

    # Create new session if requested (default for cron usage)
    if args.new_session:
        exe = shutil.which("openclaw") or shutil.which("openclaw.cmd") or shutil.which("openclaw.exe")
        if exe:
            try:
                subprocess.run([exe, "sessions", "new"], check=True, capture_output=True, text=True)
                report_lines.append("- newSessionCreated: True")
            except Exception as e:
                report_lines.append(f"- newSessionCreated: False (error: {e})")
        else:
            report_lines.append("- newSessionCreated: False (openclaw CLI not found)")

    sys.stdout.write("\n".join(report_lines) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
