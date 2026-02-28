# opentwitter Twitter/X 数据获取

> 通过 6551 API 获取 Twitter/X 数据、KOL 推文和热点

## 功能特性

- ✅ 获取用户信息
- ✅ 获取用户推文
- ✅ 搜索推文（关键词/用户/标签）
- ✅ 获取粉丝事件
- ✅ 获取已删除推文
- ✅ 获取 KOL 关注者

## 环境要求

| 组件 | 说明 |
|------|------|
| TWITTER_TOKEN | 从 https://6551.io/mcp 获取 |
| curl | HTTP 客户端 |

## 快速部署

### 1. 获取 Token

访问 https://6551.io/mcp 获取 `TWITTER_TOKEN`

### 2. 设置环境变量

**Windows**:
```powershell
$env:TWITTER_TOKEN="your_token_here"
```

**macOS/Linux**:
```bash
export TWITTER_TOKEN="your_token_here"
```

### 3. 测试

```bash
curl -s -X POST "https://ai.6551.io/open/twitter_user_info" \
  -H "Authorization: Bearer $TWITTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "elonmusk"}'
```

## 使用方法

### 获取用户信息

```bash
curl -s -X POST "https://ai.6551.io/open/twitter_user_info" \
  -H "Authorization: Bearer $TWITTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "VitalikButerin"}'
```

### 获取用户推文

```bash
curl -s -X POST "https://ai.6551.io/open/twitter_user_tweets" \
  -H "Authorization: Bearer $TWITTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "VitalikButerin", "maxResults": 10}'
```

### 搜索推文

```bash
# 关键词搜索
curl -s -X POST "https://ai.6551.io/open/twitter_search" \
  -H "Authorization: Bearer $TWITTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"keywords": "bitcoin ethereum", "minLikes": 500, "maxResults": 10}'

# 特定用户
curl -s -X POST "https://ai.6551.io/open/twitter_search" \
  -H "Authorization: Bearer $TWITTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fromUser": "VitalikButerin", "maxResults": 10}'

# 标签搜索
curl -s -X POST "https://ai.6551.io/open/twitter_search" \
  -H "Authorization: Bearer $TWITTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"hashtag": "crypto", "minLikes": 100, "maxResults": 10}'
```

### 获取粉丝事件

```bash
# 新粉丝
curl -s -X POST "https://ai.6551.io/open/twitter_follower_events" \
  -H "Authorization: Bearer $TWITTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "elonmusk", "isFollow": true, "maxResults": 20}'

# 取关
curl -s -X POST "https://ai.6551.io/open/twitter_follower_events" \
  -H "Authorization: Bearer $TWITTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "elonmusk", "isFollow": false, "maxResults": 20}'
```

### 获取已删除推文

```bash
curl -s -X POST "https://ai.6551.io/open/twitter_deleted_tweets" \
  -H "Authorization: Bearer $TWITTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "elonmusk", "maxResults": 20}'
```

## API 参数

### User Tweets

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 是 | Twitter 用户名（不带@） |
| maxResults | integer | 否 | 最大推文数 (1-100) |
| product | string | 否 | "Latest" 或 "Top" |
| includeReplies | boolean | 否 | 包含回复推文 |
| includeRetweets | boolean | 否 | 包含转推 |

### Search

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| keywords | string | 否 | 搜索关键词 |
| fromUser | string | 否 | 推文来自某用户 |
| toUser | string | 否 | 推文发送给某用户 |
| mentionUser | string | 否 | 推文提及某用户 |
| hashtag | string | 否 | 标签（不带#） |
| minLikes | integer | 否 | 最小点赞数 |
| minRetweets | integer | 否 | 最小转推数 |
| sinceDate | string | 否 | 开始日期 (YYYY-MM-DD) |
| untilDate | string | 否 | 结束日期 (YYYY-MM-DD) |
| lang | string | 否 | 语言代码 (en/zh) |

## 数据结构

### Tweet

```json
{
  "id": "1234567890",
  "text": "Tweet content...",
  "createdAt": "2024-02-20T12:00:00Z",
  "retweetCount": 1000,
  "favoriteCount": 5000,
  "replyCount": 200,
  "userScreenName": "elonmusk"
}
```

## 文件结构

```
opentwitter/
├── SKILL.md              # 技能说明
├── README.md             # 本文件
└── WORKFLOW.md           # 工作流集成
```

## 注意事项

1. **Token 安全**：不要提交到 git
2. **速率限制**：每次最多 100 条结果
3. **用户名**：不带 @ 符号

## 许可证

MIT License
