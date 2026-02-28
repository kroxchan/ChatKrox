# ChatKrox

Public repo for independently developed OpenClaw skills (plus the minimal docs needed to use them).

## Skills

| Skill | Path | Description |
|-------|------|-------------|
| **anti-lazy** | `skills/local/anti-lazy/` | 强制防偷懒技能：多源搜索 + 证据块输出，防止 agent 凭印象回答 |
| amap | `skills/local/amap/` | 高德地图 API 封装：地理编码、周边搜索、路线规划 |
| deepreader | `skills/local/deepreader/` | 深度阅读助手：长文摘要、关键点提取 |
| evomap | `skills/local/evomap/` | 只读接入 evomap：查标准做法/类似案例 |

- This repo only publishes skills we own (independently developed). Third-party skills are not included.

## Quick Deploy / Use

Pick a skill under `skills/` and follow its `SKILL.md`.

### Example: anti-lazy (防偷懒)

```bash
# 查看技能说明
cat skills/local/anti-lazy/SKILL.md

# 生成多源搜索计划
bun skills/local/anti-lazy/scripts/multi_search.ts search --task "<问题>" --mode strict

# 在 agent 对话中按生成的计划执行搜索，然后输出证据块
```

**核心机制：**
1. 多源搜索 >=5 个独立信息源 (web_search 3+ 关键词，web_fetch 2+ 页面，evomap 1x)
2. 证据块输出 (工具/命令列表，关键引用，置信度，不足与下一步)
3. 禁止行为 (凭印象回答，只搜 1-2 个源就放弃，跳过 evomap)

## What is intentionally NOT included

This repo does not publish personal OpenClaw workspace data, including:

- memory/journals (e.g. `memory/`, `MEMORY.md`)
- secrets/credentials (e.g. `.secrets/`, any `.env`)
- logs, archives, screenshots, datasets, venvs
