# opennews (加密货币新闻搜索)

通过 6551 API 获取加密货币新闻、AI 评级和交易信号。

## 环境要求

1. 设置环境变量 `OPENNEWS_TOKEN`（从 https://6551.io/mcp 获取）
2. 安装 `curl`：`brew install curl`（macOS）或 Windows 自带

## API 端点

**Base URL**: https://ai.6551.io

**认证**: `Authorization: Bearer $OPENNEWS_TOKEN`

## 用法

### 1. 获取新闻源

```bash
curl -s -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  "https://ai.6551.io/open/news_type"
```

返回新闻源分类树（engineType: news/listing/onchain/meme/market）。

### 2. 搜索新闻

**获取最新新闻**：
```bash
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 10, "page": 1}'
```

**按关键词搜索**：
```bash
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"q": "bitcoin ETF", "limit": 10, "page": 1}'
```

**按币种搜索**：
```bash
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"coins": ["BTC"], "limit": 10, "page": 1}'
```

**按新闻源筛选**：
```bash
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"engineTypes": {"news": ["Bloomberg", "Reuters"]}, "limit": 10, "page": 1}'
```

**只看有币种的新闻**：
```bash
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"hasCoin": true, "limit": 10, "page": 1}'
```

### 3. 搜索参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| limit | integer | 是 | 每页结果数 (1-100) |
| page | integer | 是 | 页码 (从 1 开始) |
| q | string | 否 | 全文关键词搜索 |
| coins | string[] | 否 | 币种代码列表 (如 ["BTC","ETH"]) |
| engineTypes | map[string][]string | 否 | 按引擎和新闻类型筛选 |
| hasCoin | boolean | 否 | 只返回有关联币种的新闻 |

### 4. 数据结构

**新闻文章**：
```json
{
  "id": "unique-article-id",
  "text": "Article headline / content",
  "newsType": "Bloomberg",
  "engineType": "news",
  "link": "https://...",
  "coins": [{"symbol": "BTC", "market_type": "spot", "match": "title"}],
  "aiRating": {
    "score": 85,
    "grade": "A",
    "signal": "long",
    "status": "done",
    "summary": "Chinese summary",
    "enSummary": "English summary"
  },
  "ts": 1708473600000
}
```

## 常用工作流

### 快速市场概览

```bash
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 10, "page": 1}' | jq '.data[] | {text, newsType, signal: .aiRating.signal}'
```

### 高影响力新闻 (AI 评分 >= 80)

```bash
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 50, "page": 1}' | jq '[.data[] | select(.aiRating.score >= 80)]'
```

### 比特币新闻

```bash
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"coins": ["BTC"], "limit": 20, "page": 1}'
```

### 以太坊新闻

```bash
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"coins": ["ETH"], "limit": 20, "page": 1}'
```

## 注意事项

1. **Token 获取**: https://6551.io/mcp
2. **速率限制**: 每次最多 100 条结果
3. **AI 评级**: 不是所有文章都有 AI 评级（检查 `status == "done"`）
4. **时间戳**: `ts` 字段是毫秒级 Unix 时间戳
