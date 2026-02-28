# OpenClaw + Codex 协作架构

> 让 OpenClaw 主模型调度 Codex 执行代码任务，实现职责分离的智能协作

## 🎯 核心优势

- ✅ **职责分离**：主模型 (Qwen) 负责理解需求，Codex 负责执行代码
- ✅ **无需 acpx**：绕过 acpx 认证兼容性问题
- ✅ **跨代理访问**：可以查看子代理详细执行过程
- ✅ **会话持久化**：子代理会话可复用，支持多步骤任务

## 📐 架构图

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

## 🚀 快速开始

### 1. 安装 Codex CLI

```powershell
npm install -g @openai/codex@latest
```

### 2. 配置认证

编辑 `~/.codex/auth.json`：

```json
{
  "OPENAI_API_KEY": "your_api_key",
  "auth_mode": "apikey"
}
```

### 3. 启用跨代理访问

```powershell
openclaw config set tools.agentToAgent.enabled true
openclaw gateway restart
```

### 4. 测试调用

```powershell
sessions_spawn --agentId coder --task "列出当前目录的前 5 个文件"
```

## 📖 文档

| 文档 | 说明 |
|------|------|
| [docs/CODEX-INTEGRATION.md](docs/CODEX-INTEGRATION.md) | 完整部署指南 |
| [examples/codex-examples.md](examples/codex-examples.md) | 使用示例 |
| [scripts/setup-codex-integration.ps1](scripts/setup-codex-integration.ps1) | 自动配置脚本 |
| [skills/README.md](skills/README.md) | 技能集合索引 |

## 💡 使用场景

### 文件操作
```json
{
  "agentId": "coder",
  "task": "列出 workspace 目录下所有 .py 文件，并统计总行数"
}
```

### 代码修复
```json
{
  "agentId": "coder",
  "task": "检查 scripts/ 目录下的 Python 脚本，找出语法错误并修复"
}
```

### 批量任务
```json
{
  "agentId": "coder",
  "task": "为所有 .md 文件生成目录结构"
}
```

## 🔧 配置说明

### openclaw.json
```json
{
  "tools": {
    "agentToAgent": {
      "enabled": true
    }
  }
}
```

### Codex 配置位置

| 文件 | 位置 |
|------|------|
| auth.json | `~/.codex/auth.json` |
| config.toml | `~/.codex/config.toml` |

## 📊 性能参考

| 任务类型 | 耗时 | Token |
|----------|------|-------|
| 文件列表 | 10-15 秒 | ~8k |
| 代码检查 | 30-60 秒 | ~15k |
| 批量处理 | 60-120 秒 | ~30k |

## 🛠️ 常用命令

```powershell
# 列出子代理
subagents list

# 查看子代理历史
sessions_history --sessionKey <key> --limit 20

# 查看配置
openclaw config get tools.agentToAgent

# 重启 Gateway
openclaw gateway restart
```

## ❓ 常见问题

**Q: sessions_spawn 返回 "agentId is not allowed"**  
A: 确保 `agentId` 在允许列表中（`coder`, `rescue`, `main`）

**Q: 无法查看子代理历史**  
A: 确认 `tools.agentToAgent.enabled = true` 并重启 gateway

**Q: Codex 认证失败**  
A: 检查 `~/.codex/auth.json` 和 `config.toml` 配置

## 📝 更新日志

### 2026-02-28
- ✅ 初始版本发布
- ✅ sessions_spawn 方案验证
- ✅ 跨代理访问启用
- ✅ 完整文档发布

## 🔗 参考链接

- [OpenClaw 文档](https://docs.openclaw.ai)
- [Codex CLI](https://codex.openai.com)
- [部署指南](docs/CODEX-INTEGRATION.md)

## 📄 许可证

MIT License
