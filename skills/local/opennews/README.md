# opennews 加密货币新闻搜索

> 通过 6551 API 获取加密货币新闻、AI 评级和交易信号

## 功能特性

- ✅ 关键词搜索加密新闻
- ✅ 按币种筛选（BTC/ETH 等）
- ✅ 按新闻源筛选（Bloomberg/Reuters 等）
- ✅ AI 评级和交易信号（long/neutral/short）
- ✅ 高影响力新闻筛选（score >= 80）

## 环境要求

| 组件 | 说明 |
|------|------|
| OPENNEWS_TOKEN | 从 https://6551.io/mcp 获取 |
| curl | HTTP 客户端 |

## 快速部署

### 1. 获取 Token

访问 https://6551.io/mcp 获取 `OPENNEWS_TOKEN`

### 2. 设置环境变量

**Windows**:
```powershell
$env:OPENNEWS_TOKEN="your_token_here"
```

**macOS/Linux**:
```bash
export OPENNEWS_TOKEN="your_token_here"
```

### 3. 测试

```bash
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 1, "page": 1}'
```

## 使用方法

### 获取最新新闻

```bash
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 10, "page": 1}'
```

### 按关键词搜索

```bash
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"q": "bitcoin ETF", "limit": 10}'
```

### 按币种筛选

```bash
# 比特币
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"coins": ["BTC"], "limit": 10}'

# 以太坊
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"coins": ["ETH"], "limit": 10}'
```

### 高影响力新闻

```bash
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 50}' | jq '[.data[] | select(.aiRating.score >= 80)]'
```

## API 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| limit | integer | 是 | 每页结果数 (1-100) |
| page | integer | 是 | 页码 (从 1 开始) |
| q | string | 否 | 全文关键词搜索 |
| coins | string[] | 否 | 币种代码列表 |
| engineTypes | map | 否 | 按引擎和新闻类型筛选 |
| hasCoin | boolean | 否 | 只返回有关联币种的新闻 |

## 数据结构

```json
{
  "id": "unique-article-id",
  "text": "Article headline",
  "newsType": "Bloomberg",
  "engineType": "news",
  "link": "https://...",
  "aiRating": {
    "score": 85,
    "grade": "A",
    "signal": "long",
    "status": "done",
    "summary": "中文摘要"
  }
}
```

## 文件结构

```
opennews/
├── SKILL.md              # 技能说明
├── README.md             # 本文件
└── WORKFLOW.md           # 工作流集成
```

## 注意事项

1. **Token 安全**：不要提交到 git
2. **速率限制**：每次最多 100 条结果
3. **AI 评级**：不是所有新闻都有（检查 `status == "done"`）

## 许可证

MIT License
