# 加密新闻集成时间线

## 什么时候可以用？

### 立即可用 ✅

**条件**：
1. 已获取 Token（OPENNEWS_TOKEN + TWITTER_TOKEN）
2. 已设置环境变量
3. 网络可访问 6551.io

**获取 Token**：https://6551.io/mcp

### 测试流程（5 分钟）

```powershell
# 1. 设置 Token（Windows）
$env:OPENNEWS_TOKEN="your_token_here"
$env:TWITTER_TOKEN="your_token_here"

# 2. 测试 OpenNews
curl -s -X POST "https://ai.6551.io/open/news_search" `
  -H "Authorization: Bearer $env:OPENNEWS_TOKEN" `
  -H "Content-Type: application/json" `
  -d '{"limit": 1, "page": 1}'

# 3. 测试 Twitter
curl -s -X POST "https://ai.6551.io/open/twitter_user_info" `
  -H "Authorization: Bearer $env:TWITTER_TOKEN" `
  -H "Content-Type: application/json" `
  -d '{"username": "elonmusk"}'
```

**预期输出**：
- OpenNews: JSON 格式的新闻数据
- Twitter: JSON 格式的用户信息

## 集成阶段

### 阶段 1: 手动测试（现在）

**目标**：验证 Token 有效，API 可访问

**步骤**：
1. 获取 Token
2. 设置环境变量
3. 运行测试命令
4. 确认返回数据正常

**时间**：5-10 分钟

### 阶段 2: 手动触发 Cron（明天）

**目标**：验证 Cron 任务配置正确

**步骤**：
```powershell
# 创建 Cron 任务
openclaw cron add --name "晨报 C-加密新闻" `
  --cron "25 9 * * *" `
  --session isolated `
  --message "获取加密新闻..." `
  --channel wecom `
  --to ChenZhengKang `
  --announce `
  --best-effort-deliver

# 手动触发测试
openclaw cron run <jobId>
```

**时间**：10-15 分钟

### 阶段 3: 自动执行（后天开始）

**目标**：每天早上 9:25 自动获取加密新闻

**步骤**：
1. 确认 Cron 任务已启用
2. 等待第二天 9:25 自动执行
3. 检查 WeCom 是否收到消息

**时间**：自动执行

### 阶段 4: 完整晨报 C（下周）

**目标**：整合新闻 + Twitter + 体育

**步骤**：
1. 9:25 获取加密新闻（opennews）
2. 9:26 获取 Twitter 热点（opentwitter）
3. 9:28 生成完整晨报 C
4. 9:30 发送给用户

**时间**：自动执行

## 现有晨报 C 对比

### 当前晨报 C
```
【晨报 C - 加密 + 体育】
- 手动编辑或简单爬虫
- 无 AI 评级
- 无 Twitter 热点
```

### 集成后晨报 C
```
【晨报 C - 加密 + 体育】

🔴 加密新闻（AI 高评分）
1. [Bloomberg] Bitcoin ETF 获批... (AI: 85, long)
2. [Reuters] Ethereum 升级... (AI: 78, neutral)

🐦 Twitter 热点
1. @elonmusk: "Bitcoin..." (5.2K likes)
2. @VitalikButerin: "Ethereum..." (3.8K likes)

📊 今日关注
- Bitcoin ETF 审批
- Ethereum Gas 费
```

**改进**：
- ✅ AI 评分筛选高影响力新闻
- ✅ Twitter KOL 热点
- ✅ 交易信号（long/neutral/short）
- ✅ 自动获取，无需手动编辑

## 依赖检查清单

### 必须项 ❗

- [ ] OPENNEWS_TOKEN 已获取
- [ ] TWITTER_TOKEN 已获取
- [ ] 环境变量已设置
- [ ] 网络可访问 6551.io

### 推荐项 ✅

- [ ] jq 已安装（用于 JSON 处理）
- [ ] curl 已安装
- [ ] 科学上网工具已配置

### 可选项 ⭐

- [ ] 晨报 Cron 任务已创建
- [ ] 测试任务已运行
- [ ] WeCom 投递已验证

## 故障排查

### 问题 1: Token 无效

**错误**：`401 Unauthorized`

**解决**：
1. 检查 Token 是否正确复制
2. 确认 Token 未过期
3. 重新获取 Token: https://6551.io/mcp

### 问题 2: 网络不可达

**错误**：`Connection timeout`

**解决**：
1. 检查科学上网工具
2. 确认 6551.io 可访问
3. 尝试更换代理节点

### 问题 3: 无返回数据

**错误**：空 JSON 或 `data: []`

**解决**：
1. 增加 limit 参数
2. 检查搜索关键词
3. 确认 API 端点正确

## 联系支持

- Token 获取：https://6551.io/mcp
- API 文档：见 SKILL.md
- 工作流配置：见 WORKFLOW.md
