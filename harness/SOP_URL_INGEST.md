# SOP: URL Ingest (DeepReader-first)

Goal: when a URL appears (X/Reddit/YouTube/webpage/docs), ingest it into Markdown knowledge and persist to `memory/inbox/`.

## Default policy

- Preferred first choice: DeepReader (local ingest to Markdown).
- If DeepReader fails, try OpenClaw-native `web_fetch`.
- If `web_fetch` fails (blocked/dynamic), try `r.jina.ai` fallback.
- If still blocked, use the local OpenClaw-managed browser (profile=openclaw) to navigate dynamic pages and extract the target URL/content.
- If the site requires your logged-in session, THEN use Chrome extension relay (profile=chrome) after you attach a tab.
- Always report which path succeeded and why a path failed.

## What counts as success

- A `.md` file is created under `memory/inbox/` with YAML frontmatter.
- The response includes: title, source label (no raw URL), saved file path.

## Source labels

Use these labels (no raw URL):
- X (FxTwitter/Nitter)
- Reddit (.json)
- YouTube (transcript)
- Web (Trafilatura)

## When to run DeepReader

- Any user message contains `http://` or `https://`.
- Any scheduled prefetch selects a candidate URL for caching.
- Any request: "read/summarize/clip/remember this link".

## Storage rules

- Default ingest destination: `memory/inbox/` (keep private; do not publish).
- Do not ingest: login pages, paywalls requiring credentials, CAPTCHAs.

## Notes

- Windows console can be GBK; avoid printing emojis in automation logs.
- Network environments may break HTTPS cert validation; if so, prefer `r.jina.ai` for content fetch.
