# Agent Meeting Room (MVP)

一个可视化的多 Agent 会议室原型，支持：
- 话题创建与轮次讨论
- OpenClaw 实时命令接入（`openclaw agent --json`）
- Codex 直连 `codex exec`（失败时回退本地可校验工程代理）
- 主持人控制（`pause` / `resume` / `next_turn` / `force_speaker` / `end_topic` / `start_topic`）
- 话题卡片内一键启动（queued -> active）
- WebSocket 实时事件推送
- 系统事件流面板（turn/message/topic/adapter error）
- 连接状态显示（在线/重连中）
- 全量时间线回放 API

## Run

```bash
cd C:\Users\Krox\agent-war-room
npm install
npm start
```

打开：`http://localhost:5077`

## One-Click Start (Windows)

项目内置便捷启动脚本：

```bash
C:\Users\Krox\agent-war-room\start-agent-war-room.cmd
```

行为：
- 若 `5077` 端口未监听：自动拉起 `npm start`
- 自动打开 `http://localhost:5077`

同目录还包含 `start-agent-war-room.ps1`（由 `.cmd` 调用）。

## OpenClaw 配置

可选环境变量：
- `OPENCLAW_BIN`：OpenClaw 命令，Windows 默认 `openclaw.cmd`
- `OPENCLAW_AGENT_ID`：调用的 OpenClaw agent id，默认 `main`（会自动探测可用 agent 并回退）
- `OPENCLAW_FALLBACK_AGENT_ID`：OpenClaw 超时后的备用 agent id（自动重试一次），默认 `rescue`
- `OPENCLAW_TIMEOUT_SEC`：OpenClaw 调用超时秒数，默认 `45`
- `OPENCLAW_FAST_TIMEOUT_SEC`：会议轮次中的快速超时（优先用于连续对话），默认 `20`
- `OPENCLAW_TRANSCRIPT_MSGS`：OpenClaw 每轮携带的历史消息条数，默认 `4`
- `OPENCLAW_TRANSCRIPT_CHARS`：每条历史消息最大截断字符，默认 `220`
- `CODEX_MODE`：Codex 模式，默认 `hybrid`（`hybrid`=先快速 builtin，再后台 `codex exec` 深度补充；`cli`=仅 `codex exec`；`builtin`=仅本地规则引擎）
- `CODEX_CLI_BIN`：Codex CLI 命令，默认 `codex`
- `CODEX_CLI_TIMEOUT_SEC`：Codex CLI 超时秒数，默认 `35`
- `CODEX_CLI_PRIMARY_TIMEOUT_SEC`：Codex 主链路超时秒数（强模式/辩论场景使用），默认 `45`
- `CODEX_CLI_MODEL`：Codex CLI 模型，默认 `gpt-5.2`
- `CODEX_CLI_WORKDIR`：Codex CLI 工作目录，默认项目下 `.codex_cli_workspace`（用于隔离项目指令污染）
- `OPENCLAW_CADENCE`：连续模式下 OpenClaw 发言频率（每 N 轮至少一次），默认 `3`
- `TURN_STRATEGY`：发言调度策略，默认 `balanced`（Codex/OpenClaw 在话题内尽量 1:1）
- `CODEX_STRENGTH`：Codex 强度档位，默认 `strong`（主持触发时优先 Codex，且保持平衡补齐）
- `CODEX_DEEP_ROUND_ROBIN`：是否在轮询轮次触发 Codex 深度补充（hybrid 模式后台执行），默认 `true`

说明：
- 在当前工程里，若首选 agent 为 `main` 且配置了 fallback，服务会优先使用 fallback 作为首发通道（避免 `main` lane 拥塞）。
- 会议默认连续自动讨论（`autoRoundRobin=true`），只有识别到“需要你选择/确认”的回复时才自动暂停。
- `CODEX_MODE=hybrid` 时：关键轮次会先给快速答复，再异步追加一条 `codex-cli` 深度答复（若执行成功）。

## SQLite 配置（默认已按你的要求）

- 默认数据库：`D:\agent-war-room\meeting-room.sqlite`
- 默认上限：`50MB`

可选环境变量：
- `AGENT_ROOM_DB_PATH`：自定义 SQLite 文件路径
- `AGENT_ROOM_DB_MAX_MB`：自定义 DB 上限（MB）

说明：
- 启用 SQLite 持久化，服务重启后会议数据仍保留。
- 达到容量上限时会尝试自动清理可裁剪的旧会议。

## API (MVP)

- `GET /api/meetings`
- `POST /api/meetings`
- `GET /api/meetings/:meetingId`
- `GET /api/meetings/:meetingId/timeline`
- `POST /api/meetings/:meetingId/participants`
- `POST /api/meetings/:meetingId/topics`
- `POST /api/meetings/:meetingId/messages`
- `POST /api/meetings/:meetingId/control`

常用 `control.action`：
- `pause`
- `resume`
- `next_turn`
- `force_speaker`
- `end_topic`
- `start_topic`
