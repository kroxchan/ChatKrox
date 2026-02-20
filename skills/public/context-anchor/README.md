# context-anchor

Persist a minimal, durable "context anchor" to disk so cron isolated sessions (and other new sessions) can reliably reconstruct required instructions.

## What problem this solves

- `openclaw cron` jobs run in isolated sessions by default.
- Isolated sessions do not carry the main chat history.
- Long chats can also exceed the context window and lose earlier details.

This skill makes the workflow deterministic by storing the non-negotiable rules in files under `memory/anchors/`.

## Files

- Skill definition: `skills/public/context-anchor/SKILL.md`
- Script: `skills/public/context-anchor/scripts/context_anchor.py`
- Anchors (local state): `memory/anchors/*.md`
- Index (optional): `memory/anchors/INDEX.md`

## Usage

Create/update an anchor:

```bash
python skills/public/context-anchor/scripts/context_anchor.py url-ingest \
  --title "URL Ingest SOP" \
  --body "Hard order:\n1) DeepReader\n2) web_fetch\n3) r.jina.ai\n4) browser relay\n\nSuccess criteria:\n- Create memory/inbox/*.md with YAML frontmatter\n- Reply: title, source label (no raw URL), saved path" \
  --index
```

Output is the saved anchor path, e.g.:

- `memory/anchors/url-ingest.md`

## Notes

- Do not store secrets or API keys in anchors.
- For login/captcha/payment pages, anchors should include a stop-and-ask rule.
