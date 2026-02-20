# ChatKrox

Public repo for independently developed OpenClaw skills (plus the minimal docs needed to use them).

## Skills

- `skills/amap/` - AMap (Gaode) Web Service API CLI: geocode/reverse-geocode/IP locate/weather/routes/POI

## Quick Deploy / Use

Prereqs:
- Install Bun: https://bun.sh/
- Set env var `AMAP_MAPS_API_KEY` (do NOT commit it)

Run (examples):

```bash
cd skills/amap
bun scripts/amap.ts --help
bun scripts/amap.ts poi-around --location "121.4737,31.2304" --keywords "餐厅" --radius 1500
```

More examples:
- `skills/amap/references/examples.md`
- `skills/amap/references/command-map.md`

## What is intentionally NOT included

This repo does not publish personal OpenClaw workspace data, including:

- memory/journals (e.g. `memory/`, `MEMORY.md`)
- secrets/credentials (e.g. `.secrets/`, any `.env`)
- logs, archives, screenshots, datasets, venvs
