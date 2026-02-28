# opentwitter (Twitter/X 数据获取)

通过 6551 API 获取 Twitter/X 数据。

## 环境要求

1. 设置环境变量 `TWITTER_TOKEN`（从 https://6551.io/mcp 获取）
2. 安装 `curl`：`brew install curl`（macOS）或 Windows 自带

## 用法

### 1. 获取用户信息

```bash
curl -s -X POST "https://ai.6551.io/open/twitter_user_info" \
  -H "Authorization: Bearer $TWITTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "elonmusk"}'
```

### 2. 获取用户推文

```bash
curl -s -X POST "https://ai.6551.io/open/twitter_user_tweets" \
  -H "Authorization: Bearer $TWITTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "VitalikButerin", "maxResults": 10}'
```

### 3. 搜索推文

```bash
# 搜索关键词
curl -s -X POST "https://ai.6551.io/open/twitter_search" \
  -H "Authorization: Bearer $TWITTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"keywords": "bitcoin", "maxResults": 20, "product": "Top"}'

# 搜索特定用户
curl -s -X POST "https://ai.6551.io/open/twitter_search" \
  -H "Authorization: Bearer $TWITTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fromUser": "VitalikButerin", "maxResults": 20}'

# 搜索标签
curl -s -X POST "https://ai.6551.io/open/twitter_search" \
  -H "Authorization: Bearer $TWITTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"hashtag": "crypto", "minLikes": 100, "maxResults": 20}'
```

### 4. 获取粉丝事件

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

### 5. 获取已删除推文

```bash
curl -s -X POST "https://ai.6551.io/open/twitter_deleted_tweets" \
  -H "Authorization: Bearer $TWITTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "elonmusk", "maxResults": 20}'
```

## 工作流集成

### 晨报 Twitter 热点

```bash
# 搜索加密货币热门推文
curl -s -X POST "https://ai.6551.io/open/twitter_search" \
  -H "Authorization: Bearer $TWITTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"keywords": "bitcoin ethereum", "minLikes": 1000, "product": "Top", "maxResults": 10}'
```

### KOL 监控

```bash
# 获取 Vitalik 最新推文
curl -s -X POST "https://ai.6551.io/open/twitter_user_tweets" \
  -H "Authorization: Bearer $TWITTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "VitalikButerin", "maxResults": 5, "includeReplies": false}'
```

## 注意事项

1. Token 获取：https://6551.io/mcp
2. 速率限制：每次最多 100 条结果
3. 用户名不带 @ 符号
4. 需要科学上网访问 Twitter API
