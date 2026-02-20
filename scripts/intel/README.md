# Intel Prefetch

This folder contains a quiet, offline cache builder for the 09:30 daily news briefing.

## What it does

- Runs in the background (recommended at night)
- Searches for fresh items by topic
- Writes candidates into `data/intel/cache.jsonl`
- Maintains a de-dup history in `data/intel/history.json`

## Requirements

- Env var `BRAVE_API_KEY`

## Run

```bash
python scripts/intel/prefetch.py
```

No messages are sent. This is only a cache builder.
