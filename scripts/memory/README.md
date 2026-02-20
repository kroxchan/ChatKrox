# Memory Janitor

This is a lightweight TTL janitor for `MEMORY.md`.

## Tag format

- `- [P0] ...` permanent
- `- [P1|expire:YYYY-MM-DD] ...` project-ish, auto-archive after expire date
- `- [P2|expire:YYYY-MM-DD] ...` short-lived, auto-archive after expire date

If `expire:` is missing, the entry is kept.

## Run

```bash
python scripts/memory/janitor.py
```

## Output

- Archived entries are appended to `memory/archive/MEMORY-archive-YYYY-MM-DD.md`.
- `MEMORY.md` is rewritten without archived entries.

Note: This script does not touch daily logs (`memory/YYYY-MM-DD.md`).
