# 加密货币新闻 + Twitter 工作流

## 集成目标

将 opennews（加密新闻）和 opentwitter（Twitter 热点）集成到现有的晨报工作流中。

## 现有晨报结构

目前晨报分为 A/B/C 三类：
- **A**: 政治国际 + 科技
- **B**: 财经市场
- **C**: 加密 + 体育

## opennews 集成点

### 1. 晨报 C - 加密新闻

**任务**：每天早上 9:25 获取加密新闻

**实现**：
```bash
# 获取最新加密新闻
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 20, "page": 1}'
```

**输出格式**：
```
【加密新闻热点】
1. [Bloomberg] Bitcoin ETF 获批，SEC 正式批准... (AI 评分：85, 信号：long)
2. [Reuters] Ethereum 2.0 升级完成，Gas 费降低 90%... (AI 评分：78, 信号：neutral)
3. ...
```

### 2. 晨报 C - 高影响力新闻

**任务**：筛选 AI 评分 >= 80 的高影响力新闻

**实现**：
```bash
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 50, "page": 1}' | jq '[.data[] | select(.aiRating.score >= 80)]'
```

### 3. 晨报 C - 特定币种新闻

**比特币新闻**：
```bash
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"coins": ["BTC"], "limit": 10, "page": 1}'
```

**以太坊新闻**：
```bash
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"coins": ["ETH"], "limit": 10, "page": 1}'
```

## Twitter 集成点

### 1. 加密 Twitter 热点

**任务**：获取加密 Twitter 热门推文

**实现**：
```bash
curl -s -X POST "https://ai.6551.io/open/twitter_search" \
  -H "Authorization: Bearer $TWITTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"keywords": "bitcoin ethereum crypto", "minLikes": 500, "product": "Top", "maxResults": 10}'
```

### 2. KOL 推文监控

**Vitalik 推文**：
```bash
curl -s -X POST "https://ai.6551.io/open/twitter_user_tweets" \
  -H "Authorization: Bearer $TWITTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "VitalikButerin", "maxResults": 5, "includeReplies": false}'
```

## 综合晨报 C 工作流

### 步骤 1: 获取加密新闻 (9:25)

```bash
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 15, "page": 1}'
```

### 步骤 2: 获取 Twitter 热点 (9:26)

```bash
curl -s -X POST "https://ai.6551.io/open/twitter_search" \
  -H "Authorization: Bearer $TWITTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"keywords": "bitcoin ethereum", "minLikes": 1000, "product": "Top", "maxResults": 5}'
```

### 步骤 3: 生成晨报 (9:28)

整合新闻和 Twitter 热点，输出格式：

```
【晨报 C - 加密 + 体育】

🔴 加密新闻
1. [Bloomberg] Bitcoin ETF 获批... (AI: 85, long)
2. [Reuters] Ethereum 升级... (AI: 78, neutral)

🐦 Twitter 热点
1. @elonmusk: "Bitcoin is..." (5.2K likes)
2. @VitalikButerin: "Ethereum 2.0..." (3.8K likes)

📊 今日关注
- Bitcoin ETF 审批进展
- Ethereum Gas 费变化
```

## 配置步骤

### 1. 获取 Token

**OpenNews Token**: https://6551.io/mcp  
**Twitter Token**: https://6551.io/mcp

### 2. 设置环境变量

**Windows PowerShell**:
```powershell
$env:OPENNEWS_TOKEN="your_opennews_token"
$env:TWITTER_TOKEN="your_twitter_token"
[Environment]::SetEnvironmentVariable("OPENNEWS_TOKEN", "your_opennews_token", "User")
[Environment]::SetEnvironmentVariable("TWITTER_TOKEN", "your_twitter_token", "User")
```

**macOS/Linux**:
```bash
export OPENNEWS_TOKEN="your_opennews_token"
export TWITTER_TOKEN="your_twitter_token"
```

### 3. 验证配置

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

## Cron 集成示例

### 晨报 C - 加密新闻（每天 9:25）

```json
{
  "name": "晨报 C-加密新闻",
  "schedule": "25 9 * * *",
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "获取加密新闻：limit=15, page=1。输出格式：[新闻源] 标题 (AI 评分，信号)。只输出前 10 条。"
  },
  "delivery": {
    "mode": "announce",
    "channel": "wecom",
    "to": "ChenZhengKang"
  }
}
```

### 晨报 C - Twitter 热点（每天 9:26）

```json
{
  "name": "晨报 C-加密 Twitter 热点",
  "schedule": "26 9 * * *",
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "获取加密 Twitter 热点：搜索 bitcoin ethereum, minLikes=500, product=Top, maxResults=5。输出格式：@用户名：推文内容 (likes 数)"
  },
  "delivery": {
    "mode": "announce",
    "channel": "wecom",
    "to": "ChenZhengKang"
  }
}
```

## 注意事项

1. **速率限制**: OpenNews 每次最多 100 条，Twitter 每次最多 100 条
2. **Token 安全**: 不要提交到 git
3. **科学上网**: 需要访问 6551.io API
4. **错误处理**: Token 过期时返回 401
5. **AI 评级**: 不是所有新闻都有 AI 评级（检查 `status == "done"`）
