# crypto-news (加密新闻 + Twitter 热点聚合)

整合 opennews 和 opentwitter 两个 MCP，提供加密新闻和 Twitter 热点聚合。

## 环境要求

1. 设置环境变量：
   - `OPENNEWS_TOKEN`（从 https://6551.io/mcp 获取）
   - `TWITTER_TOKEN`（从 https://6551.io/mcp 获取）
2. 安装 `curl` 和 `jq`（用于 JSON 处理）

## 用法

### 1. 获取加密新闻

```bash
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 15, "page": 1}'
```

### 2. 获取 Twitter 热点

```bash
curl -s -X POST "https://ai.6551.io/open/twitter_search" \
  -H "Authorization: Bearer $TWITTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"keywords": "bitcoin ethereum crypto", "minLikes": 500, "product": "Top", "maxResults": 10}'
```

### 3. 获取特定币种新闻

**比特币**：
```bash
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"coins": ["BTC"], "limit": 10, "page": 1}'
```

**以太坊**：
```bash
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"coins": ["ETH"], "limit": 10, "page": 1}'
```

### 4. 高影响力新闻（AI 评分 >= 80）

```bash
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 50, "page": 1}' | jq '[.data[] | select(.aiRating.score >= 80)]'
```

## 晨报 C 集成工作流

### 步骤 1: 获取加密新闻（9:25）

```bash
NEWS=$(curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 15, "page": 1}')
```

### 步骤 2: 获取 Twitter 热点（9:26）

```bash
TWITTER=$(curl -s -X POST "https://ai.6551.io/open/twitter_search" \
  -H "Authorization: Bearer $TWITTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"keywords": "bitcoin ethereum", "minLikes": 1000, "product": "Top", "maxResults": 5}')
```

### 步骤 3: 生成晨报 C（9:28）

整合新闻和 Twitter 热点，输出格式：

```
【晨报 C - 加密 + 体育】

🔴 加密新闻（AI 高评分）
1. [Bloomberg] Bitcoin ETF 获批，SEC 正式批准... (AI: 85, long)
2. [Reuters] Ethereum 2.0 升级完成，Gas 费降低 90%... (AI: 78, neutral)
3. [CoinDesk] ...

🐦 Twitter 热点
1. @elonmusk: "Bitcoin is the future..." (5.2K likes)
2. @VitalikButerin: "Ethereum 2.0 update..." (3.8K likes)
3. ...

📊 今日关注
- Bitcoin ETF 审批进展
- Ethereum Gas 费变化
- 监管动态
```

## Cron 任务配置

### 加密新闻（每天 9:25）

```json
{
  "name": "晨报 C-加密新闻",
  "schedule": "25 9 * * *",
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "获取加密新闻：调用 opennews API，limit=15。筛选 AI 评分>=80 的高影响力新闻。输出格式：[新闻源] 标题 (AI 评分，信号)。只输出前 10 条。"
  },
  "delivery": {
    "mode": "announce",
    "channel": "wecom",
    "to": "ChenZhengKang"
  }
}
```

### Twitter 热点（每天 9:26）

```json
{
  "name": "晨报 C-加密 Twitter 热点",
  "schedule": "26 9 * * *",
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "获取加密 Twitter 热点：搜索 bitcoin ethereum crypto, minLikes=500, product=Top, maxResults=5。输出格式：@用户名：推文内容 (likes 数)"
  },
  "delivery": {
    "mode": "announce",
    "channel": "wecom",
    "to": "ChenZhengKang"
  }
}
```

## 配置 Token

### Windows PowerShell

```powershell
# 临时设置（当前会话）
$env:OPENNEWS_TOKEN="your_opennews_token_here"
$env:TWITTER_TOKEN="your_twitter_token_here"

# 永久设置（用户级别）
[Environment]::SetEnvironmentVariable("OPENNEWS_TOKEN", "your_opennews_token_here", "User")
[Environment]::SetEnvironmentVariable("TWITTER_TOKEN", "your_twitter_token_here", "User")
```

### macOS/Linux

```bash
# 临时设置（当前会话）
export OPENNEWS_TOKEN="your_opennews_token_here"
export TWITTER_TOKEN="your_twitter_token_here"

# 永久设置（添加到 ~/.zshrc 或 ~/.bashrc）
echo 'export OPENNEWS_TOKEN="your_opennews_token_here"' >> ~/.zshrc
echo 'export TWITTER_TOKEN="your_twitter_token_here"' >> ~/.zshrc
source ~/.zshrc
```

## 测试

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

## 注意事项

1. **Token 获取**: https://6551.io/mcp
2. **速率限制**: 每次最多 100 条结果
3. **科学上网**: 需要访问 6551.io API
4. **Token 安全**: 不要提交到 git
5. **AI 评级**: 不是所有新闻都有 AI 评级（检查 `aiRating.status == "done"`）
