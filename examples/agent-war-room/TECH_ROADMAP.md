# Agent Meeting Room 技术路线图

## 1. 当前实现拆解（as-is）

### 1.1 服务入口与模块边界

- 单体服务：`server.js`
- UI 静态资源：`public/`
- 运行时内存：`store.meetings` + `clientsByMeeting`
- 持久化：SQLite（`node:sqlite DatabaseSync`）

关键子系统：
- 调度层：话题状态机、轮次推进、发言者选择
- 适配层：OpenClaw/Codex/builtin 三层回退
- 防护层：模板拦截、低信息密度拦截、检索门禁
- 存储层：meeting/topic/message/event 全量落库
- 传输层：REST + WebSocket

### 1.2 核心状态模型

`meeting.runtime`（关键字段）：
- `paused`: 是否暂停
- `autoPaused`: 是否系统自动暂停
- `currentTopicId`: 当前 active 话题
- `nextAgentCursor`: 默认轮询游标
- `turnInFlight`: 是否有轮次执行中
- `noNewInfoStreak`: 连续无新增信息计数
- `pendingTurnReason`: 执行中触发的新轮次原因

`topic.state`：
- `queued` -> `active` -> `closed`

### 1.3 调度算法（已实现）

入口：`runNextTurn(meetingId, reason)`

流程：
1. 运行前检查：meeting/topic 存在、非暂停、非 in-flight
2. 轮次上限检查：超过 `maxRounds` 自动收敛
3. 发言者选择：
   - 优先 `TURN_STRATEGY=balanced` 的平衡策略（Codex/OpenClaw 尽量 1:1）
   - host interrupt/topic start 时偏向快路径
   - round-robin 中按 `OPENCLAW_CADENCE` 控制 OpenClaw 节奏
4. 执行 `runAgentTurn`
5. 完成后更新轮次、no-new-info 计数、是否自动继续

防抖与并发：
- `scheduleNextTurn` 统一 350ms 延迟调度
- in-flight 时写入 `pendingTurnReason`，避免丢轮次

### 1.4 适配器链路（已实现）

#### OpenClaw

主链路：
- 命令：`openclaw agent --agent <id> --message <prompt> --json --timeout <sec>`

容错：
- 检测 timeout/aborted/unknown agent
- 自动 bump session revision（隔离旧上下文）
- fallback 到备用 agent（默认 `rescue`）

#### Codex

三层路径：
1. `codex-cli`（强路径）
2. `openclaw-coder`（CLI 失败时回退）
3. builtin 规则引擎（兜底）

模式开关：
- `CODEX_MODE=builtin|cli|hybrid`
- `hybrid` 支持“前台快答 + 后台深答追加”

### 1.5 防模板/防降智机制（已实现）

关键函数：
- `isCodexMetaReply`
- `isCodexScaffoldReply`
- `isTemplateLikeReply`
- `isLowInformationCodexReply`
- `enforceNoTemplateReply`

策略：
- 命中模板化内容时，直接重写为 `buildDirectReply` 的有效回答
- 命中离题内容（如要求粘贴 SOUL/USER/MEMORY）直接清洗或丢弃
- 命中复读则在 round-robin 下跳过并计数

### 1.6 检索门禁（已实现）

触发：`isLookupTask` 判定为信息检索类请求。

校验：
- 检测 coverage/gate 信号
- 检测“未门禁通过就宣告找不到”
- 命中后自动发起强制重答（不询问主持人）
- 重答仍失败则返回阻断文案，避免错误结论出流

### 1.7 上传与附件（已实现）

- `POST /api/meetings/:meetingId/uploads`
- `multer` 落盘到 `public/uploads`
- 消息 `meta.attachment` 挂载：`url/name/mime/size`
- 前端根据 `kind=image|file` 显示预览或下载链接

### 1.8 持久化与裁剪（已实现）

存储表：
- `meetings`
- `participants`
- `topics`
- `messages`
- `events`

容量策略：
- `AGENT_ROOM_DB_MAX_MB` 上限控制
- 达上限后自动 prune 可回收会议（无 active topic）

## 2. 已知问题与技术债

- `server.js` 体积过大（单文件 > 2k 行），维护成本高
- 调度、适配、提示词、校验逻辑耦合在同一文件
- 事件类型目前无统一 schema（前后端靠约定）
- 自动总结 `summarizeTopic` 仍是模板化摘要
- 尚未提供系统化回归测试（主要依赖人工回放）

## 3. 技术路线图（to-be）

## 3.1 Phase A：稳定性优先（短期，1-2 周）

目标：先把“能用且不乱”做稳。

交付：
- 模块拆分：
  - `src/runtime/scheduler.js`
  - `src/adapters/openclaw.js`
  - `src/adapters/codex.js`
  - `src/guards/reply-guard.js`
  - `src/storage/sqlite.js`
- 统一错误码：`TIMEOUT` / `ADAPTER_UNAVAILABLE` / `GATE_BLOCKED` / `TOPIC_CHANGED`
- WS 事件 schema 文档化

验收标准：
- 超时误报率显著下降（有回复不再显示纯超时）
- 不再出现跨 topic 回复串线
- 关键路径日志可按 `meetingId/topicId/runId` 一键串联

## 3.2 Phase B：工程化与可测试（中期，2-4 周）

目标：把“可维护”补齐。

交付：
- 契约测试：REST/WS 基础用例
- 回放测试：读取历史 timeline 自动比对行为
- Prompt 版本化与 A/B 开关
- 负载测试：并发 topic 与长会话稳定性

验收标准：
- 提交前可本地跑最小回归
- 新增策略不再需要手工回放全链路验证

## 3.3 Phase C：协作增强（中期，4-8 周）

目标：从“可用”到“好用”。

交付：
- 更细粒度协作策略：
  - 任务分工（Codex=设计/实现，OpenClaw=执行/校验）
  - 动态发言权重（按问题类型切换）
- 附件增强：批量上传、引用附件片段、OCR/文档摘要
- 主持人视图增强：
  - 决策点聚合
  - 风险告警
  - 结论摘要卡片

验收标准：
- 主持人无需手工强制切换 speaker 即可完成大多数任务
- 附件驱动任务成功率明显提升

## 3.4 Phase D：产品化（长期）

目标：可部署、可运营、可审计。

交付：
- 认证与权限（会话隔离、只读/主持/管理员）
- 配置中心（策略热更新）
- 观察平台（指标、告警、审计导出）
- Docker 化与一键部署脚本

## 4. 推荐落地顺序

1. 先做 Phase A（拆模块 + 错误码 + schema）
2. 再做 Phase B（测试基线）
3. 稳定后再推进 Phase C/C+D

理由：当前主要痛点是稳定性和可调试性，不先解决这一层，功能扩展会放大故障面。

## 5. 验收清单（可直接用于发布前检查）

- 主持人发消息后，3 秒内至少出现 1 条有效 agent 回复
- OpenClaw 迟到回复不会被超时事件覆盖
- Codex 不再输出模板化“首次回应/当前诉求/判断依据行动”
- 查询类问题未达门禁时不会返回“找不到信息”
- 话题切换后旧 topic 不再继续入流
- 上传图片/文件可在 UI 中可见并可访问
