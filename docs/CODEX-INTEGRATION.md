# OpenClaw + Codex 协作架构部署指南

## 架构概述

本方案实现了 OpenClaw 主模型 (Qwen) 调度 Codex 执行代码任务的协作架构。

```
┌─────────────────┐
│  主模型 (Qwen)   │  ← 理解需求、任务拆解、会话管理
└────────┬────────┘
         │ sessions_spawn
         ↓
┌─────────────────┐
│  子代理 (Codex)  │  ← 执行代码、脚本、文件操作
└─────────────────┘
```

## 核心优势

- ✅ **职责分离**：主模型负责调度，Codex 负责执行
- ✅ **无需 acpx**：绕过 acpx 认证兼容性问题
- ✅ **跨代理访问**：可以查看子代理详细执行过程
- ✅ **会话持久化**：子代理会话可复用

---

## 环境要求

| 组件 | 版本 | 说明 |
|------|------|------|
| OpenClaw | 2026.2.19-2+ | 主框架 |
| Codex CLI | latest | Windows 环境 |
| Node.js | 22+ | Windows 环境 |
| WSL2 | optional | acpx 方案需要 |

---

## 部署步骤

### 1. 安装 Codex CLI（Windows）

```powershell
npm install -g @openai/codex@latest
```

### 2. 配置 Codex 认证

创建 `~/.codex/auth.json`：

```json
{
  "OPENAI_API_KEY": "your_api_key",
  "auth_mode": "apikey"
}
```

创建 `~/.codex/config.toml`：

```toml
model_provider = "yunyi"
model = "gpt-5.3-codex"
model_reasoning_effort = "high"
disable_response_storage = true
preferred_auth_method = "apikey"

[model_providers.yunyi]
name = "yunyi"
base_url = "https://yunyi.rdzhvip.com/codex"
wire_api = "responses"
experimental_bearer_token = "your_api_key"
requires_openai_auth = true
```

### 3. 启用跨代理访问

```powershell
openclaw config set tools.agentToAgent.enabled true
openclaw gateway restart
```

验证配置：

```powershell
openclaw config get tools.agentToAgent
# 输出：{"enabled": true}
```

---

## 使用方法

### 基本调用

```powershell
# 在 OpenClaw 对话中
sessions_spawn --agentId coder --task "列出当前目录的前 10 个文件"
```

### 带标签的调用

```powershell
sessions_spawn --agentId coder --label "file-list-task" --task "..."
```

### 超时设置

```powershell
sessions_spawn --agentId coder --timeoutSeconds 120 --task "..."
```

---

## 示例场景

### 场景 1：文件操作

```json
{
  "agentId": "coder",
  "task": "列出 workspace 目录下所有 .py 文件，并统计总行数",
  "timeoutSeconds": 120
}
```

### 场景 2：代码修复

```json
{
  "agentId": "coder",
  "task": "检查 scripts/ 目录下的 Python 脚本，找出有语法错误的文件并修复",
  "timeoutSeconds": 300
}
```

### 场景 3：批量任务

```json
{
  "agentId": "coder",
  "task": "为所有 .md 文件生成目录结构",
  "timeoutSeconds": 180
}
```

---

## 查看子代理执行历史

```powershell
# 列出最近的子代理
subagents list

# 查看子代理详细执行历史
sessions_history --sessionKey <subagent-session-key> --limit 20 --includeTools true
```

---

## 配置说明

### openclaw.json 关键配置

```json
{
  "tools": {
    "agentToAgent": {
      "enabled": true
    }
  }
}
```

### Codex 配置文件位置

| 文件 | 位置 |
|------|------|
| auth.json | `~/.codex/auth.json` |
| config.toml | `~/.codex/config.toml` |
| 会话存储 | `~/.codex/state_*.sqlite` |
| 历史记录 | `~/.codex/history.jsonl` |

---

## 常见问题

### Q1: sessions_spawn 返回 "agentId is not allowed"

**解决**：确保 `agentId` 在允许列表中（`coder`, `rescue`, `main`）

### Q2: 子代理执行超时

**解决**：增加 `timeoutSeconds` 参数，或检查任务复杂度

### Q3: 无法查看子代理历史

**解决**：确认 `tools.agentToAgent.enabled = true` 并重启 gateway

### Q4: Codex 认证失败

**解决**：检查 `~/.codex/auth.json` 和 `config.toml` 配置是否正确

---

## 性能优化

### 1. 复用子代理会话

对于相关任务，使用相同的 `label` 可以复用会话：

```json
{
  "agentId": "coder",
  "label": "refactor-task",
  "task": "第一步：分析代码结构"
}
```

```json
{
  "agentId": "coder",
  "label": "refactor-task",
  "task": "第二步：重构模块 A"
}
```

### 2. 合理设置超时

| 任务类型 | 建议超时 |
|----------|----------|
| 简单文件操作 | 60 秒 |
| 代码分析 | 120 秒 |
| 批量处理 | 300 秒 |
| 复杂重构 | 600 秒 |

### 3. 监控 Token 消耗

```powershell
subagents list
# 查看 totalTokens 字段
```

---

## 最佳实践

1. **任务拆解**：将复杂任务拆分为多个简单子任务
2. **明确指令**：任务描述要具体，避免歧义
3. **设置超时**：防止任务无限期运行
4. **添加标签**：便于追踪和管理相关任务
5. **查看历史**：定期检查子代理执行历史，优化任务描述

---

## 架构对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| **sessions_spawn** | ✅ 简单直接<br>✅ 无需额外配置<br>✅ 已验证可用 | ⚠️ 需要跨代理访问 enabled |
| **acpx (WSL)** | ✅ 会话持久化<br>✅ 支持命名会话 | ❌ 认证兼容性问题<br>❌ 需要 WSL 环境 |
| **ACP 插件** | ✅ 官方推荐 | ❌ 插件不存在<br>❌ 需要额外安装 |

**推荐方案**：`sessions_spawn`（当前方案）

---

## 更新日志

### 2026-02-28
- ✅ 初始版本发布
- ✅ sessions_spawn 方案验证
- ✅ 跨代理访问启用
- ✅ 文档完善

---

## 参考链接

- [OpenClaw 文档](https://docs.openclaw.ai)
- [Codex CLI](https://codex.openai.com)
- [ACP 协议](https://agentclientprotocol.com)
- [acpx 项目](https://github.com/openclaw/acpx)

---

## 许可证

MIT License
