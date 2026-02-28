# crypto-news 加密新闻聚合

> 整合 opennews 和 opentwitter，提供加密货币新闻和 Twitter 热点聚合

## 功能特性

- ✅ 加密新闻搜索（关键词/币种/新闻源筛选）
- ✅ Twitter 热点聚合（KOL 推文/热门话题）
- ✅ AI 评分筛选（高影响力新闻 score>=80）
- ✅ 交易信号（long/neutral/short）

## 环境要求

| 组件 | 说明 |
|------|------|
| OPENNEWS_TOKEN | 从 https://6551.io/mcp 获取 |
| TWITTER_TOKEN | 从 https://6551.io/mcp 获取 |
| curl | HTTP 客户端 |
| jq | JSON 处理（可选） |

## 快速部署

### 1. 获取 Token

访问 https://6551.io/mcp 获取：
- `OPENNEWS_TOKEN`
- `TWITTER_TOKEN`

### 2. 设置环境变量

**Windows PowerShell**:
```powershell
$env:OPENNEWS_TOKEN="your_token_here"
$env:TWITTER_TOKEN="your_token_here"
```

**macOS/Linux**:
```bash
export OPENNEWS_TOKEN="your_token_here"
export TWITTER_TOKEN="your_token_here"
```

### 3. 测试

```bash
# 测试 OpenNews
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 1, "page": 1}'

# 测试 Twitter
curl -s -X POST "https://ai.6551.io/open/twitter_user_info" \
  -H "Authorization: Bearer $TWITTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "elonmusk"}'
```

## 使用方法

### 获取加密新闻

```bash
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 15, "page": 1}'
```

### 按币种筛选

```bash
# 比特币新闻
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"coins": ["BTC"], "limit": 10}'

# 以太坊新闻
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"coins": ["ETH"], "limit": 10}'
```

### 高影响力新闻（AI 评分>=80）

```bash
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 50}' | jq '[.data[] | select(.aiRating.score >= 80)]'
```

### 获取 Twitter 热点

```bash
curl -s -X POST "https://ai.6551.io/open/twitter_search" \
  -H "Authorization: Bearer $TWITTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"keywords": "bitcoin ethereum", "minLikes": 500, "maxResults": 10}'
```

## 集成晨报 C

### 配置 Cron 任务

**9:25 获取加密新闻**：
```json
{
  "name": "晨报 C-加密新闻",
  "schedule": "25 9 * * *",
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "获取加密新闻，limit=15，筛选 AI 评分>=80"
  },
  "delivery": {
    "mode": "announce",
    "channel": "wecom",
    "to": "ChenZhengKang"
  }
}
```

**9:26 获取 Twitter 热点**：
```json
{
  "name": "晨报 C-加密 Twitter 热点",
  "schedule": "26 9 * * *",
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "获取加密 Twitter 热点，minLikes=500, maxResults=5"
  },
  "delivery": {
    "mode": "announce",
    "channel": "wecom",
    "to": "ChenZhengKang"
  }
}
```

## 输出格式

```
【晨报 C - 加密 + 体育】

🔴 加密新闻（AI 高评分）
1. [Bloomberg] Bitcoin ETF 获批 (AI: 95, long) ⭐⭐⭐
2. [Reuters] Ethereum 升级完成 (AI: 85, neutral) ⭐⭐

🐦 Twitter 热点
1. @elonmusk: "Bitcoin is..." (5.2K likes)
2. @VitalikButerin: "Ethereum 2.0..." (3.8K likes)

📊 今日关注
- Bitcoin ETF 审批进展
- Ethereum Gas 费变化
```

## 文件结构

```
crypto-news/
├── SKILL.md              # 技能说明
├── README.md             # 本文件
└── INTEGRATION.md        # 集成时间线
```

## API 参数

### News Search

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| limit | integer | 是 | 每页结果数 (1-100) |
| page | integer | 是 | 页码 (从 1 开始) |
| q | string | 否 | 全文关键词搜索 |
| coins | string[] | 否 | 币种代码列表 |
| engineTypes | map | 否 | 按引擎和新闻类型筛选 |
| hasCoin | boolean | 否 | 只返回有关联币种的新闻 |

### Twitter Search

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| keywords | string | 否 | 搜索关键词 |
| minLikes | integer | 否 | 最小点赞数 |
| maxResults | integer | 否 | 最大结果数 (1-100) |
| product | string | 否 | "Top" 或 "Latest" |

## 注意事项

1. **Token 安全**：不要提交到 git
2. **速率限制**：每次最多 100 条结果
3. **AI 评级**：不是所有新闻都有（检查 `aiRating.status == "done"`）

## 许可证

MIT License

## 反馈

Issue: https://github.com/kroxchan/ChatKrox/issues
