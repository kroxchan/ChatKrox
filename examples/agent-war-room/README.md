# Agent Meeting Room (MVP)

一个可视化的多 Agent 会议室原型，支持：
- 话题创建与轮次讨论
- OpenClaw 实时命令接入（`openclaw agent --json`）
- Codex 内置工程视角发言
- 主持人控制（pause/resume/next_turn/force_speaker/end_topic）
- WebSocket 实时事件推送
- 全量时间线回放 API

## Run

```bash
cd C:\Users\Krox\agent-war-room
npm install
npm start
```

打开：`http://localhost:5077`

## OpenClaw 配置

可选环境变量：
- `OPENCLAW_BIN`：OpenClaw 命令，Windows 默认 `openclaw.cmd`
- `OPENCLAW_AGENT_ID`：调用的 OpenClaw agent id，默认 `main`
- `OPENCLAW_TIMEOUT_SEC`：OpenClaw 调用超时秒数，默认 `45`

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