---
name: context-anchor
description: Prevent context loss across cron isolated sessions or long chats by persisting a minimal "context anchor" to disk and reloading it on demand. Use when users complain the agent forgets context, when scheduling OpenClaw cron jobs that must not lose instructions, or when workflows need a stable SOP/requirements file that survives session switches.
---

# Context Anchor

Use a file-based anchor so any new session (cron isolated, reconnect, long thread) can reconstruct the required instructions.

## Default layout

- Anchor directory: `memory/anchors/`
- Each anchor is one Markdown file: `memory/anchors/<slug>.md`
- Optional index: `memory/anchors/INDEX.md`

## Workflow

1) If the user references "that rule/SOP" or complains about forgetting, create (or update) an anchor file.
2) Keep anchors short: only the hard rules, success criteria, and output contract.
3) For cron: ensure the cron task reads the anchor first, then executes.
4) When responding after using an anchor, always include:
   - title
   - source label (avoid raw URL when requested)
   - saved path

## Slug rules

- Use lowercase, digits, and hyphens.
- Examples: `url-ingest`, `daily-briefing`, `expense-rules`.

## What to store

- Non-negotiable rules ("hard order")
- Success criteria
- Output format contract
- Safety stops (login/captcha/payment)

Avoid:
- secrets/keys
- full transcripts
- raw personal data that shouldn't persist

## Bundled script

If you need deterministic behavior, use `scripts/context_anchor.py`.
