# Agent Reach 配置指南

## 当前状态

### ✅ 可用渠道 (3/12)

| 渠道 | 状态 | 命令 |
|------|------|------|
| **Twitter/X** | ✅ 可用 | `xreach twitter://user/elonmusk` |
| **RSS/Atom** | ✅ 可用 | `xreach rss://https://example.com/feed.xml` |
| **任意网页** | ✅ 可用 | `curl https://r.jina.ai/https://example.com` |

### ⚠️ 已安装但检测失败

| 渠道 | 状态 | 说明 |
|------|------|------|
| **YouTube** | ⚠️ yt-dlp 已安装 | PATH 问题，可用完整路径调用 |
| **B 站** | ⚠️ yt-dlp 已安装 | 同上 |

### ❌ 需要安装

| 渠道 | 需要 | 状态 |
|------|------|------|
| **Docker** | 小红书/抖音 | ❌ 未安装 |
| **gh CLI** | GitHub | ❌ 未安装 |
| **mcporter** | 全网搜索 | ❌ PyPI 无此包 |

---

## 配置步骤

### 1. 修复 yt-dlp（YouTube/B 站）

**状态**：✅ 已完成

yt-dlp 已安装在：
```
C:\Users\Krox\AppData\Roaming\Python\Python314\Scripts\yt-dlp.exe
```

**使用方法**：
```powershell
# 使用完整路径
C:\Users\Krox\AppData\Roaming\Python\Python314\Scripts\yt-dlp.exe "https://youtube.com/watch?v=xxxxx"

# 或重启 PowerShell 后直接使用
yt-dlp "https://youtube.com/watch?v=xxxxx"
```

**测试**：
```powershell
# YouTube
C:\Users\Krox\AppData\Roaming\Python\Python314\Scripts\yt-dlp.exe --simulate "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# B 站
C:\Users\Krox\AppData\Roaming\Python\Python314\Scripts\yt-dlp.exe --simulate "https://www.bilibili.com/video/BV1xxxx"
```

---

### 2. 安装 Docker（小红书/抖音）

**状态**：⏳ 需要用户确认

**下载**：
```
https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe
```

**安装后配置**：

**小红书**：
```powershell
# 启动 MCP 服务
docker run -d --name xiaohongshu-mcp -p 18060:18060 xpzouying/xiaohongshu-mcp

# 配置 Cookie（见下方 Cookie 配置）
agent-reach configure xiaohongshu-cookies "PASTED_STRING"
```

**抖音**：
```powershell
# 安装 MCP 服务
pip install douyin-mcp-server

# 启动服务
cd douyin-mcp-server
uv sync && uv run python run_http.py

# 或直接用 Python
python -c "from douyin_mcp_server.server import mcp; mcp()"
```

---

### 3. 配置代理（中国大陆）

**状态**：⏳ 需要用户提供代理

```powershell
agent-reach configure proxy http://user:pass@ip:port
```

**测试**：
```powershell
agent-reach doctor
```

---

### 4. 配置 Cookie（Twitter/小红书）

**状态**：⏳ 需要用户提供 Cookie

#### 步骤 1：安装 Cookie-Editor

安装 [Cookie-Editor](https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm)

#### 步骤 2：导出 Cookie

1. 登录对应平台（twitter.com 或 xiaohongshu.com）
2. 点击 Cookie-Editor 插件
3. 点击 **Export** → **Header String**
4. 复制导出的字符串

#### 步骤 3：配置

**Twitter**：
```powershell
agent-reach configure twitter-cookies "PASTED_STRING"
```

**小红书**：
```powershell
agent-reach configure xiaohongshu-cookies "PASTED_STRING"
```

---

### 5. 安装 gh CLI（GitHub）

**状态**：⏳ 需要安装

**下载**：
```
https://cli.github.com
```

**安装后测试**：
```powershell
gh --version
```

---

## 使用示例

### YouTube 视频字幕

```json
{
  "agentId": "coder",
  "task": "使用 yt-dlp 下载 YouTube 视频字幕：https://youtube.com/watch?v=xxxxx，输出字幕内容",
  "timeoutSeconds": 120
}
```

**实际命令**：
```powershell
C:\Users\Krox\AppData\Roaming\Python\Python314\Scripts\yt-dlp.exe --write-sub --sub-lang en --skip-download "https://youtube.com/watch?v=xxxxx"
```

### B 站视频字幕

```json
{
  "agentId": "coder",
  "task": "使用 yt-dlp 下载 B 站视频字幕：https://b23.tv/xxxxx，输出字幕内容",
  "timeoutSeconds": 120
}
```

### Twitter 推文搜索

```json
{
  "agentId": "coder",
  "task": "使用 xreach 搜索 Twitter 上关于 'bitcoin' 的热门推文，minLikes=500，输出前 10 条",
  "timeoutSeconds": 120
}
```

### RSS 订阅监控

```json
{
  "agentId": "coder",
  "task": "读取 RSS 源 https://example.com/feed.xml，输出最新 5 篇文章标题和链接",
  "timeoutSeconds": 60
}
```

### 任意网页语义读取

```json
{
  "agentId": "coder",
  "task": "使用 Jina Reader 读取 https://example.com 的内容，输出主要信息",
  "timeoutSeconds": 60
}
```

---

## 故障排查

### yt-dlp 命令找不到

**问题**：`yt-dlp : 无法将"yt-dlp"项识别为 cmdlet`

**解决**：
1. 使用完整路径：`C:\Users\Krox\AppData\Roaming\Python\Python314\Scripts\yt-dlp.exe`
2. 或重启 PowerShell（PATH 已更新）

### Docker 无法启动

**问题**：Docker Desktop 启动失败

**解决**：
1. 确认已启用 WSL2：`wsl --list --verbose`
2. 确认虚拟化已启用（BIOS 设置）
3. 重启电脑后重试

### Cookie 配置失败

**问题**：配置后仍无法访问

**解决**：
1. 确认 Cookie 未过期（重新导出）
2. 确认使用 Header String 格式
3. 检查代理配置

---

## 注意事项

1. **Cookie 安全**：
   - 使用专用账号，不要用主账号
   - Cookie 会存储在 `~/.agent-reach/` 目录下
   - 定期更新 Cookie（过期后重新导出）

2. **速率限制**：
   - Twitter：避免频繁搜索（间隔 >=5 分钟）
   - YouTube：避免批量下载（间隔 >=1 分钟）
   - 小红书：避免频繁访问（间隔 >=10 分钟）

3. **账号风控**：
   - 频繁访问可能导致账号受限
   - 使用代理 IP 可降低风险
   - 建议使用专用账号

---

## 许可证

MIT License
