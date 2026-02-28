# Twitter/X + 新闻聚合工作流

## 集成目标

将 Twitter 热点和新闻聚合集成到现有的晨报/新闻工作流中。

## 现有晨报结构

目前晨报分为 A/B/C 三类：
- **A**: 政治国际 + 科技
- **B**: 财经市场
- **C**: 加密 + 体育

## Twitter 集成点

### 1. 晨报 C - 加密热点

**任务**：每天早上 9:30 获取加密 Twitter 热点

**实现**：
```bash
# 搜索比特币热门推文
curl -s -X POST "https://ai.6551.io/open/twitter_search" \
  -H "Authorization: Bearer $TWITTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": "bitcoin ethereum crypto",
    "minLikes": 500,
    "product": "Top",
    "maxResults": 10
  }'
```

**输出格式**：
```
【加密 Twitter 热点】
1. @elonmusk: "Bitcoin is the future..." (5.2K likes)
2. @VitalikButerin: "Ethereum 2.0 update..." (3.8K likes)
3. ...
```

### 2. 晨报 A - 科技新闻

**任务**：获取科技 KOL 最新推文

**实现**：
```bash
# 获取科技 KOL 推文
curl -s -X POST "https://ai.6551.io/open/twitter_user_tweets" \
  -H "Authorization: Bearer $TWITTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "VitalikButerin",
    "maxResults": 5,
    "includeReplies": false
  }'
```

### 3. 实时监控（可选）

**任务**：监控特定 KOL 的推文

**实现**：
```bash
# 每 2 小时检查一次
curl -s -X POST "https://ai.6551.io/open/twitter_user_tweets" \
  -H "Authorization: Bearer $TWITTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "elonmusk",
    "maxResults": 3,
    "product": "Latest"
  }'
```

## 配置步骤

### 1. 获取 Token

访问 https://6551.io/mcp 获取 `TWITTER_TOKEN`

### 2. 设置环境变量

**Windows PowerShell**:
```powershell
$env:TWITTER_TOKEN="your_token_here"
[Environment]::SetEnvironmentVariable("TWITTER_TOKEN", "your_token_here", "User")
```

**macOS/Linux**:
```bash
export TWITTER_TOKEN="your_token_here"
# 或添加到 ~/.zshrc 或 ~/.bashrc
echo 'export TWITTER_TOKEN="your_token_here"' >> ~/.zshrc
```

### 3. 验证配置

```bash
curl -s -X POST "https://ai.6551.io/open/twitter_user_info" \
  -H "Authorization: Bearer $TWITTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "elonmusk"}'
```

## Cron 集成示例

### 加密 Twitter 热点（每天 9:25）

```json
{
  "name": "晨报 C-加密 Twitter 热点",
  "schedule": "25 9 * * *",
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "获取加密 Twitter 热点：搜索 bitcoin ethereum crypto，minLikes=500，取前 10 条热门推文。输出格式：@用户名：推文内容 (likes 数)"
  },
  "delivery": {
    "mode": "announce",
    "channel": "wecom",
    "to": "ChenZhengKang"
  }
}
```

## 注意事项

1. **速率限制**：每次最多 100 条结果
2. **Token 安全**：不要提交到 git
3. **科学上网**：需要访问 Twitter API
4. **错误处理**：Token 过期时返回 401
