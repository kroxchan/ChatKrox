# Agent Reach 集成指南

> 解锁全网访问能力：Twitter/Reddit/B 站/YouTube/小红书/抖音等

## 安装状态

### ✅ 已安装

| 组件 | 版本 | 状态 |
|------|------|------|
| agent-reach | 1.2.0 | ✅ 已安装 |
| yt-dlp | 2026.2.21 | ✅ 已安装 |
| xreach-cli | latest | ✅ 已安装 |
| undici | latest | ✅ 已安装 |

### 可用渠道 (3/12)

| 渠道 | 状态 | 说明 |
|------|------|------|
| **Twitter/X** | ✅ 可用 | 读取/搜索推文 |
| **RSS/Atom** | ✅ 可用 | 读取 RSS 订阅源 |
| **任意网页** | ✅ 可用 | Jina Reader (r.jina.ai) |

### 待配置渠道

| 渠道 | 状态 | 需要 |
|------|------|------|
| GitHub 仓库 | ⚠️ gh CLI 未安装 | winget install GitHub.cli |
| YouTube | ❌ 检测失败 | pip install yt-dlp (已装) |
| 全网搜索 | ❌ mcporter 异常 | PyPI 无此包 |
| Reddit | ⬜ 需要代理 | 服务器 IP 被封锁 |
| B 站 | ❌ yt-dlp 检测失败 | 已安装 |
| 小红书 | ⬜ 需要 Docker | xiaohongshu-mcp |
| 抖音 | ⬜ 需要 MCP | douyin-mcp-server |

## 使用方法

### 在 OpenClaw 中使用

当任务需要访问外部平台时，使用 Agent Reach：

```json
{
  "agentId": "coder",
  "task": "使用 agent-reach 读取 Twitter 上 @elonmusk 的最新推文",
  "timeoutSeconds": 120
}
```

### 直接调用

```powershell
# 读取 Twitter 推文
xreach twitter://user/elonmusk

# 搜索 Twitter
xreach "twitter://search?q=bitcoin"

# 读取 RSS
xreach "rss://https://example.com/feed.xml"

# 读取任意网页
curl https://r.jina.ai/https://example.com
```

## 配置渠道

### 1. 配置代理（中国大陆）

```powershell
agent-reach configure proxy http://user:pass@ip:port
```

### 2. 配置 Twitter Cookie

1. 安装 [Cookie-Editor](https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm)
2. 登录 twitter.com
3. 点击插件 → Export → Header String
4. 复制字符串

```powershell
agent-reach configure twitter-cookies "PASTED_STRING"
```

### 3. 配置小红书（需要 Docker）

```powershell
# 启动 MCP 服务
docker run -d --name xiaohongshu-mcp -p 18060:18060 xpzouying/xiaohongshu-mcp

# 配置 Cookie（同上）
agent-reach configure xiaohongshu-cookies "PASTED_STRING"
```

## 工作流集成

### 触发条件

当任务涉及以下场景时，使用 Agent Reach：

- **社交媒体**：Twitter/Reddit/小红书内容读取
- **视频平台**：YouTube/B 站视频和字幕
- **新闻网站**：RSS 订阅源读取
- **任意网页**：Jina Reader 语义读取

### 标准流程

1. **检查渠道状态**
   ```powershell
   agent-reach doctor
   ```

2. **配置缺失渠道**
   ```powershell
   agent-reach configure <channel> <credentials>
   ```

3. **执行任务**
   ```json
   {
     "agentId": "coder",
     "task": "使用 xreach 读取指定 URL 内容",
     "timeoutSeconds": 120
   }
   ```

## 示例场景

### 场景 1：读取 Twitter 热点

```json
{
  "agentId": "coder",
  "task": "使用 xreach 搜索 Twitter 上关于 'bitcoin' 的热门推文，minLikes=500，输出前 10 条"
}
```

### 场景 2：读取 B 站视频字幕

```json
{
  "agentId": "coder",
  "task": "使用 yt-dlp 下载 B 站视频字幕：https://b23.tv/xxxxx"
}
```

### 场景 3：监控 RSS 订阅

```json
{
  "agentId": "coder",
  "task": "读取 RSS 源 https://example.com/feed.xml，输出最新 5 篇文章标题"
}
```

## 故障排查

### 渠道显示"❌"但已安装

运行：
```powershell
agent-reach doctor
```

检查具体错误信息。

### Twitter 搜索失败

1. 确认 Cookie 已配置
2. 检查代理是否生效
3. 尝试使用 Jina Reader 备用方案

### YouTube/B 站失败

1. 确认 yt-dlp 已安装：`pip show yt-dlp`
2. 更新 yt-dlp：`pip install -U yt-dlp`
3. 检查网络连接

## 文件结构

```
agent-reach/
├── README.md              # 本文件
└── CONFIGURATION.md       # 配置指南（待创建）
```

## 注意事项

1. **Cookie 安全**：使用专用账号，不要用主账号
2. **代理配置**：中国大陆需要配置代理
3. **速率限制**：各平台有访问频率限制
4. **账号风控**：频繁访问可能导致账号受限

## 许可证

MIT License

## 反馈

- Agent Reach: https://github.com/Panniantong/agent-reach
- Issue: https://github.com/kroxchan/ChatKrox/issues
