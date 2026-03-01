# context-cleaner - 上下文清理技能

自动清理 OpenClaw 上下文，保持系统高效运行。

## 功能

1. **清理旧会话**
   - 删除超过 7 天的旧会话
   - 保留包含 "important" 或 "memory" 的关键会话
   - 自动备份会话 store

2. **归档记忆精华**
   - 读取 `memory/YYYY-MM-DD.md`（超过 30 天）
   - 提取关键信息到 `MEMORY.md`
   - 删除已归档的旧记忆文件

3. **开启新会话**
   - 清理后自动开启新会话
   - 保持上下文大小在合理范围

4. **磁盘清理**（新增）
   - 清理 npm-cache（平均释放 1-2 GB）
   - 清理 workspace/tmp 目录
   - 检查磁盘空间（低于 5GB 告警）

## 安装

```bash
# 技能已位于
skills/local/context-cleaner/
```

## 用法

### 手动执行

```bash
# 干运行（预览）
python skills/local/context-cleaner/scripts/clean_context.py --dry-run

# 实际清理
python skills/local/context-cleaner/scripts/clean_context.py

# 带磁盘清理
python skills/local/context-cleaner/scripts/clean_context.py --disk-cleanup

# 自定义参数
python skills/local/context-cleaner/scripts/clean_context.py --sessions-days 7 --memory-days 30 --new-session --disk-cleanup --disk-threshold-gb 5.0
```

### 定时任务

已配置 Cron 任务：**每天凌晨 3 点自动执行**

```json
{
  "name": "上下文清理 - 每日",
  "schedule": "0 3 * * *",
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "执行上下文清理：删除超过 7 天的旧会话，归档 30 天前的记忆精华到 MEMORY.md，然后开启新会话"
  }
}
```

## 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--dry-run` | False | 预览模式，不实际修改 |
| `--sessions-days` | 7 | 保留最近 N 天的会话 |
| `--memory-days` | 30 | 归档超过 N 天的记忆文件 |
| `--new-session` | True | 清理后开启新会话 |
| `--disk-cleanup` | False | 清理 npm-cache 和 tmp 目录 |
| `--disk-threshold-gb` | 5.0 | 磁盘空间告警阈值（GB） |

## 输出示例

```
Context cleaner report
- dryRun: False
- sessionsStore: C:\Users\Krox\.openclaw\agents\main\sessions\sessions.json
- sessionsDeleted: 151
- importantSessionsKept: 0
- memoryFilesProcessed: 0
- memoryHighlightsExtracted: 0
- memoryFilesDeleted: 0
- newSessionCreated: True

Disk Cleanup
- spaceFreed: 1.54

Disk Space Check
- freeSpaceGB: 5.04
```

## 注意事项

1. **会话备份**：每次清理前自动备份 `sessions.json`
2. **重要会话**：包含 "important" 或 "memory" 的会话不会被删除
3. **记忆提取**：使用启发式规则提取标题、要点、总结等关键信息

## 文件结构

```
context-cleaner/
├── SKILL.md           # 技能说明
├── README.md          # 本文档
├── cron.json          # Cron 配置示例
└── scripts/
    └── clean_context.py  # 清理脚本
```

## 许可证

MIT License
