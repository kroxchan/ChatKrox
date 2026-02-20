# SOP: Web/Reading/Lookup Tasks

Goal: never say "can't" until we exhaust the available methods, and always report what was tried.

## Default Attempt Order

1) Local capability (files/scripts/skills already present)
- Check workspace for relevant skill or script.
- If the user hinted a skill exists, verify it first (path + quick --help/test).

2) web_fetch
- Use `web_fetch` to retrieve the page content.
- If blocked/empty, note the error.

3) browser
- Use `browser` automation to load and extract content.
- If no attached tab/blocked by login, note what is needed.

4) Alternative fetch
- Try a non-browser fetch path such as `https://r.jina.ai/http(s)://...`.

## Required Failure Report Format

If the task still fails, reply with:
- Tried: (1) local (2) web_fetch (3) browser (4) alt fetch
- Result: for each, 1 line error/reason
- Next minimal input: exactly one thing needed (URL, login, location, etc.)

## Special Case: AMap (Gaode) POI/Weather/Routes

When the user asks "nearby food" / POI / weather / route in China:

- Repo path: `C:\Users\Krox\.openclaw\workspace\amap-skill`
- Entry: `bun skills/amap/scripts/amap.ts ...`
- Precondition: `AMAP_MAPS_API_KEY` must exist in environment.

Steps:
1) Verify key exists (do not paste it back)
2) Verify CLI works: `bun skills/amap/scripts/amap.ts --help`
3) Run the correct command (`poi-around`/`poi-text`/`weather`/...)
4) If location missing, ask for ONE minimal input:
   - `lon,lat` OR a single landmark/address to geocode
