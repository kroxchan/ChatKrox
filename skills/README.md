# OpenClaw Skills 集合

> 为 OpenClaw 设计的实用技能集合，每个技能独立部署、独立文档

## 📦 技能列表

### 本地技能 (skills/local/)

| 技能 | 说明 | 部署文档 |
|------|------|----------|
| **anti-lazy** | 防偷懒多源搜索 | [查看](local/anti-lazy/README.md) |
| **crypto-news** | 加密新闻聚合 | [查看](local/crypto-news/README.md) |

### 外部集成 (skills/)

| 技能 | 说明 | 部署文档 |
|------|------|----------|
| **agent-reach** | 全网访问（Twitter/YouTube/B 站等） | [查看](agent-reach/README.md) |

### 公共技能 (skills/public/)

| 技能 | 说明 | 部署文档 |
|------|------|----------|
| **context-anchor** | 上下文锚点 | [查看](public/context-anchor/README.md) |

### 桌面技能 (skills/desktop/)

| 技能 | 说明 | 部署文档 |
|------|------|----------|
| **desktop-control-win** | Windows 桌面控制 | [查看](desktop-control-win/README.md) |

---

## 🚀 快速开始

### 1. 选择技能

根据需求选择技能：

- **需要查证信息** → `anti-lazy`
- **需要加密新闻** → `crypto-news` 或 `opennews`
- **需要 Twitter 数据** → `opentwitter`
- **需要上下文管理** → `context-anchor`

### 2. 部署技能

每个技能独立部署，查看对应技能的 README.md：

```bash
# 示例：部署 anti-lazy
cd skills/local/anti-lazy
cat README.md  # 查看部署说明
```

### 3. 配置环境变量

根据技能要求配置环境变量：

```bash
# anti-lazy: 无需额外配置
# crypto-news: OPENNEWS_TOKEN, TWITTER_TOKEN
# opennews: OPENNEWS_TOKEN
# opentwitter: TWITTER_TOKEN
```

### 4. 测试技能

```bash
# 示例：测试 opennews
curl -s -X POST "https://ai.6551.io/open/news_search" \
  -H "Authorization: Bearer $OPENNEWS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 1}'
```

---

## 📋 技能详情

### anti-lazy 防偷懒技能

**适用场景**：法律条款/政策文件/新闻事件/地点周边/价格查询

**核心功能**：
- 强制 >=5 个独立信息源
- 证据块输出
- 禁止凭印象回答

**部署难度**：🟢 简单（无需额外配置）

---

### crypto-news 加密新闻聚合

**适用场景**：加密货币新闻 + Twitter 热点聚合

**核心功能**：
- 加密新闻搜索
- Twitter 热点聚合
- AI 评分筛选
- 交易信号

**部署难度**：🟡 中等（需要 Token）

**依赖**：
- OPENNEWS_TOKEN
- TWITTER_TOKEN

---

### opennews 加密新闻搜索

**适用场景**：加密货币新闻搜索

**核心功能**：
- 关键词搜索
- 按币种筛选
- AI 评级和交易信号

**部署难度**：🟡 中等（需要 Token）

**依赖**：
- OPENNEWS_TOKEN

---

### opentwitter Twitter 数据获取

**适用场景**：Twitter/X 数据获取

**核心功能**：
- 获取用户信息/推文
- 搜索推文
- 粉丝事件
- 已删除推文

**部署难度**：🟡 中等（需要 Token）

**依赖**：
- TWITTER_TOKEN

---

### context-anchor 上下文锚点

**适用场景**：长对话上下文管理

**核心功能**：
- 上下文锚点创建
- 上下文恢复
- 对话压缩

**部署难度**：🟢 简单（无需额外配置）

---

## 🔧 通用要求

| 组件 | 版本 | 说明 |
|------|------|------|
| OpenClaw | 2026.2.19-2+ | 主框架 |
| Node.js | 22+ | 运行时 |
| curl | latest | HTTP 客户端 |
| jq | latest | JSON 处理（可选） |

---

## 📖 文档结构

每个技能包含以下文件：

```
skill-name/
├── SKILL.md              # 技能说明（OpenClaw 格式）
├── README.md             # 部署文档（本仓库格式）
├── WORKFLOW.md           # 工作流集成（可选）
└── scripts/              # 脚本文件（可选）
```

---

## 🤝 贡献

### 添加新技能

1. 在对应目录创建技能文件夹
2. 编写 `SKILL.md` 和 `README.md`
3. 提交 PR

### 报告问题

Issue: https://github.com/kroxchan/ChatKrox/issues

---

## 📄 许可证

MIT License

---

## 🔗 相关链接

- [OpenClaw 文档](https://docs.openclaw.ai)
- [Codex 集成指南](../README-CODEX.md)
- [GitHub 仓库](https://github.com/kroxchan/ChatKrox)
