# context-cleaner (local)

定时清理 OpenClaw 会话存储，并将 `memory/` 目录里的每日自查回顾提炼归档到 `MEMORY.md`。

## 功能

- 每天凌晨 3 点运行（见 `cron.json` 示例）
- 清理超过 7 天未活跃的旧会话
- **保留重要会话**：`sessionKey`/会话 key 包含 `important` 或 `memory`
- 读取 `memory/YYYY-MM-DD.md`（超过 30 天）
- 提取“精华”追加到 `MEMORY.md`
- 删除已处理的旧记忆文件
- 输出报告：
  - 删除了多少会话
  - 追加了多少条精华
  - 保留了哪些重要会话

## 使用

在 OpenClaw 运行环境中执行：

```bash
python skills/local/context-cleaner/scripts/clean_context.py
```

可选参数：

- `--dry-run`：只打印将要执行的动作，不修改任何文件
- `--sessions-days 7`：会话保留天数（默认 7）
- `--memory-days 30`：记忆文件归档阈值（默认 30）

## 注意

- 会话清理通过修改 OpenClaw 的 session store（`openclaw sessions --json` 输出的 `path`）实现。
- 脚本会在写入前创建备份：`<sessions.json>.<YYYYMMDD-HHMMSS>.bak`。
