# Agent Meeting Room

一个面向多 Agent 协作的可视化会议室，核心目标是：
- 主持人发起话题后，`Codex` 与 `OpenClaw` 平等轮转协作
- 避免超时误报、模板复读、跨话题串线
- 保持可追踪（事件流 + SQLite 时间线回放）

当前实现是可运行的 MVP+，已经包含调度、容错、门禁与上传能力。

## 快速开始

在本仓库内运行：

```bash
cd examples/agent-war-room
npm install
npm start
```

默认地址：`http://localhost:5077`

## 已实现能力

- 会议/话题管理：创建会议、创建话题、启动/结束话题
- 主持人控制：`pause` / `resume` / `next_turn` / `force_speaker` / `start_topic` / `end_topic`
- 双代理协作：`OpenClaw` 与 `Codex` 的平衡调度（`TURN_STRATEGY=balanced`）
- Codex 多链路：`builtin` / `codex-cli` / `openclaw-coder` 回退
- OpenClaw 重试：超时或未知 agent 时自动换会话 + 备用 agent 重试
- 防模板回复：对 Codex 输出做模板/元回复/低信息密度拦截并重写
- 信息检索门禁：查询类问题强制覆盖与 gate 检查，未通过不允许“找不到”
- 上传能力：支持图片/文件上传，消息中附带附件元信息
- 全链路观测：WebSocket 事件流 + `timeline` API + SQLite 持久化

## 技术架构

```text
Browser UI (public/*)
   -> REST API (/api/meetings/*)
   -> WebSocket (/ws?meetingId=...)

Node Server (server.js)
   -> Scheduler / Topic Runtime / Guardrails
   -> Adapter Layer
        - OpenClaw CLI (openclaw agent --json)
        - Codex CLI (codex exec)
        - Builtin fallback
   -> SQLite (node:sqlite DatabaseSync)
   -> Static files (public/, uploads/)
```

## 关键运行机制

### 1) 轮次调度

- 每个 meeting 维护 runtime：`paused` / `autoPaused` / `currentTopicId` / `turnInFlight` / `noNewInfoStreak`
- `runNextTurn` 按策略选发言者并执行 `runAgentTurn`
- 默认自动轮询；只有“需要主持人拍板”或连续无新增信息时自动暂停
- 话题切换时会自动关闭旧 active 话题，防止上下文污染

### 2) OpenClaw 容错

- 主链路：`openclaw agent --json`
- 若报 timeout/aborted/unknown-agent：
  - bump adapter session revision
  - 自动切换 fallback agent（默认 `rescue`）重试
- 对查询类任务启用检索门禁重答，避免未检索就宣告失败

### 3) Codex 防降智链路

- `CODEX_MODE=hybrid`：
  - 前台先给快速有效答复
  - 后台并发 `codex-cli` 深度补充（成功则追加消息）
- 检测并过滤：
  - 元回复（要求用户再给议题/上下文）
  - 模板骨架（如“首次回应/判断->依据->行动”）
  - 低信息密度或离题内容
- 失败时回退到 `openclaw-coder` 或 builtin，保证不断流

### 4) 持久化与容量控制

- SQLite 存储 `meetings / participants / topics / messages / events`
- 默认 `D:\agent-war-room\meeting-room.sqlite`
- 容量达到上限会自动裁剪可清理的旧会议（优先非活跃）

## API 概览

- `GET /api/meetings`
- `POST /api/meetings`
- `GET /api/meetings/:meetingId`
- `GET /api/meetings/:meetingId/timeline`
- `POST /api/meetings/:meetingId/participants`
- `POST /api/meetings/:meetingId/topics`
- `POST /api/meetings/:meetingId/messages`
- `POST /api/meetings/:meetingId/uploads`（`multipart/form-data`，字段：`file`/`topicId`/`speakerId`/`caption`）
- `POST /api/meetings/:meetingId/control`

`control.action` 支持：
- `pause`
- `resume`
- `next_turn`
- `force_speaker`
- `start_topic`
- `end_topic`

## WebSocket

- 连接：`/ws?meetingId=<id>`
- 事件类型示例：
  - `connected`
  - `event`（如 `turn.started` / `turn.strategy` / `turn.adapter.retry` / `topic.closed` / `meeting.paused`）

## 主要环境变量

- OpenClaw：
  - `OPENCLAW_BIN`
  - `OPENCLAW_AGENT_ID`
  - `OPENCLAW_FALLBACK_AGENT_ID`
  - `OPENCLAW_TIMEOUT_SEC`
  - `OPENCLAW_FAST_TIMEOUT_SEC`
  - `OPENCLAW_TRANSCRIPT_MSGS`
  - `OPENCLAW_TRANSCRIPT_CHARS`
- Codex：
  - `CODEX_MODE` (`hybrid`/`cli`/`builtin`)
  - `CODEX_CLI_BIN`
  - `CODEX_CLI_TIMEOUT_SEC`
  - `CODEX_CLI_PRIMARY_TIMEOUT_SEC`
  - `CODEX_CLI_MODEL`
  - `CODEX_CLI_WORKDIR`
  - `CODEX_FULL_RELEASE`
  - `CODEX_STRENGTH`
  - `CODEX_DEEP_ROUND_ROBIN`
- 调度与存储：
  - `TURN_STRATEGY`
  - `OPENCLAW_CADENCE`
  - `NO_NEW_INFO_PAUSE_STREAK`
  - `AGENT_ROOM_DB_PATH`
  - `AGENT_ROOM_DB_MAX_MB`

## 技术路线图与详细实现

详细设计、模块拆解、里程碑和验收标准见：

- [TECH_ROADMAP.md](./TECH_ROADMAP.md)
