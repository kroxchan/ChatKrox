# OpenClaw Scripts

实用脚本集合，用于解决 OpenClaw 常见问题。

---

## cron-run-safe.ps1

**解决 `openclaw cron run` 卡住问题**：后台执行 + 超时自动终止 + 日志输出。

### 问题背景

`openclaw cron run <jobId>` 有时会卡住（gateway 超时），导致：
- 命令行无响应，必须 Ctrl+C 强制终止
- 无法获取执行结果
- 日志不完整

### 解决方案

本脚本通过后台执行 + 超时机制，确保：
- 超时自动终止，不会卡住
- 输出完整日志
- 可指定输出文件保存结果

### 用法

#### PowerShell 版（推荐）

```powershell
# 基本用法
.\scripts\cron-run-safe.ps1 -JobId <jobId>

# 指定超时时间（秒）
.\scripts\cron-run-safe.ps1 -JobId <jobId> -TimeoutSeconds 90

# 输出到文件
.\scripts\cron-run-safe.ps1 -JobId <jobId> -TimeoutSeconds 90 -OutputFile tmp\cron-run-log.txt
```

#### CMD 版

```cmd
REM 基本用法
scripts\cron-run-safe.bat <jobId>

REM 指定超时时间
scripts\cron-run-safe.bat <jobId> 90

REM 输出到文件
scripts\cron-run-safe.bat <jobId> 90 tmp\cron-run-log.txt
```

### 示例

```powershell
# 测试老婆午安任务
.\scripts\cron-run-safe.ps1 -JobId a5693687-f710-4c40-81c7-c96aff869043 -TimeoutSeconds 90

# 测试主人午安任务，输出到文件
.\scripts\cron-run-safe.ps1 -JobId 5a2890e3-41f9-48fb-8163-5c1cb22106a0 -TimeoutSeconds 90 -OutputFile tmp\noon-test.txt
```

### 返回值

- `0`: 任务成功完成
- `1`: 任务超时或被终止

### 参数说明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `-JobId` | string | (必需) | cron 任务 ID |
| `-TimeoutSeconds` | int | 90 | 超时时间（秒） |
| `-OutputFile` | string | (无) | 输出文件路径 |

---

## 其他脚本

| 脚本 | 说明 |
|------|------|
| `openclaw-cron-run.ps1` | 旧版 cron run 脚本（已废弃） |
| `openclaw-cron-run.bat` | 旧版 cron run CMD 脚本（已废弃） |

---

## 常见问题

### Q: 为什么默认超时是 90 秒？

A: `openclaw cron run` 正常执行需要 30-60 秒（生成 + 投递）。90 秒足够完成任务，同时避免无限等待。

### Q: 超时后任务会怎样？

A: 后台进程会被强制终止，但 cron 任务本身已经执行（只是你收不到结果）。下次 cron 触发时会重新执行。

### Q: 如何查看卡住的任务？

A: 使用 `openclaw cron runs --id <jobId> --limit 3` 查看最近执行记录。
