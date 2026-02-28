# WORKFLOW_AUTO.md

这份文件是 OpenClaw 在本机（Windows）+ QQBot 场景下的"主工作流 / 主 SOP"。
目标：让自动化稳定「能跑」+「能送达」，并且遇到问题时能快速定位。

更新规则（强制）
- 以后任何新踩坑、修复策略、排障结论、技能集成方式，都必须追加到本文件对应章节。
- 每次变更要写清：触发条件、证据（状态/日志）、改了什么、如何验收、如何回滚。

约束（硬规则）
- 不改 QQ IP 白名单（用户已配置好）。
- 不随意改插件 allowlist / entries（用户说"插件里有的你都可以用，这个不用动"）。
- 自动化流程里如果出现 login / captcha / anti-bot / payment / transfer 关键词：立刻停，收集证据再问。

一、系统总览（你要记住的几个事实）
1) Cron 在 OpenClaw 里有两种执行模式
- sessionTarget=main：payload.kind 必须是 systemEvent。
  机制：Cron 触发 → enqueue systemEvent → 由 main 的 heartbeat/处理循环消费 → 产生回复 → delivery(announce) 投递到 QQ。
- sessionTarget=isolated：payload.kind 必须是 agentTurn。
  机制：Cron 触发 → 直接跑 isolated 会话 → 通常能更"立刻"执行，但需要正确的 announce/target，且某些环境会遇到 pairing/权限问题。

2) "UI 里看到 Cron 触发并生成文案" ≠ "QQ 已收到"
- UI chat 里出现了 "System: [time] Cron (...)"，说明 systemEvent 已经进入 main 并被消费。
- QQ 仍没收到时，问题几乎一定在 delivery/announce → channel 发送链路，而不是 cron timer。

3) Windows 上 Gateway/Node 多以 Scheduled Task 方式运行
- `openclaw gateway restart` 会重启 Scheduled Task。
- 没管理员权限时，某些 install/force 同步做不了。

二、必备技能（Skills）集成清单（优先顺序）
- **Codex 子代理**：当任务涉及代码执行/文件操作/脚本运行时，使用 `sessions_spawn --agentId coder` 调度 Codex 执行。详见 `README-CODEX.md`。
- **Agent Reach**：当任务需要访问外部平台（Twitter/YouTube/B 站/小红书/Reddit 等）时，使用 Agent Reach。详见 `skills/agent-reach/README.md`。
- evomap（只读接入）：当问题超出当前理解/缺少标准做法时，必须先查 `tmp/evomap_ro/evomap` 的 README/docs/examples/src，提取推荐输入格式/参数/示例；仍无法解决再向用户发起澄清。
- weather：用于早安/午安/晚安中的天气（优先 Open-Meteo；失败就降级"天气数据暂不可用"）。
- technews：用于新闻/晨报类聚合。
- context-compressor / context-recovery：用于长对话压缩/恢复时，保留 SOP 和关键锚点。
- qqbot-cron：如果要改成"面向 QQ 的提醒管理"更结构化，后续可迁移到它；当前以 OpenClaw cron store 为准。
- browse（可选）：当需要浏览器自动化读取网页内容时使用（优先 web_fetch，遇到动态/登录再用 relay）。

**[P0][2026-02-28] 防偷懒强制流程（证据门槛）**
当用户问题需要获取外部信息才能回答时（包括：法律条款/政策文件/新闻事件/地点周边/路线规划/价格查询/版本状态/技术文档等），**必须**按以下流程执行：

1. **多源搜索（强制 >=5 个独立信息源）**
   - web_search：至少 3 个不同关键词/角度搜索
   - web_fetch：至少 2 个相关页面抓取全文
   - browser（如需要）：登录墙/动态页面用 Chrome Relay
   - evomap：查是否有标准做法/类似案例
   - 其他专用工具：如地点→AMap，天气→Open-Meteo

2. **证据块输出（强制）**
   - 列出所有调用的工具/命令
   - 每个来源的关键证据（引用原文/数据）
   - 结论 + 置信度（高/中/低）
   - 不足与下一步（如还有信息缺口）

3. **禁止行为**
   - 不得凭印象回答"没有/不可用/已确认"等结论
   - 不得在只搜了 1-2 个来源后就放弃
   - 不得跳过 evomap 直接问用户

4. **验收标准**
   - 如果最终回复里没有证据块 → 算偷懒，需要重新执行流程
   - 如果证据来源 <5 个且未说明原因 → 算偷懒，需要继续搜索

---

**[P0][2026-02-28] Codex 子代理使用流程**
当任务涉及以下场景时，**必须**使用 `sessions_spawn --agentId coder` 调度 Codex 执行：

1. **触发条件（满足任一即使用）**
   - 代码执行：运行 Python/PowerShell/Bash 脚本
   - 文件操作：批量读取/写入/重命名文件
   - 目录遍历：列出/搜索/统计文件
   - Git 操作：提交/推送/查看历史
   - 命令执行：需要 CLI 工具完成的任务
   - 复杂任务：需要多步骤执行的工作

---

**[P0][2026-02-28] Agent Reach 使用流程**
当任务需要访问外部平台时，**必须**使用 Agent Reach：

1. **触发条件（满足任一即使用）**
   - **社交媒体**：Twitter/Reddit/小红书内容读取
   - **视频平台**：YouTube/B 站视频和字幕
   - **新闻网站**：RSS 订阅源读取
   - **任意网页**：Jina Reader 语义读取（r.jina.ai）

2. **标准流程**
   ```powershell
   # 1. 检查渠道状态
   agent-reach doctor
   
   # 2. 配置缺失渠道
   agent-reach configure <channel> <credentials>
   
   # 3. 执行任务
   xreach twitter://user/elonmusk
   ```

3. **可用渠道**
   - ✅ Twitter/X：读取/搜索推文
   - ✅ RSS/Atom：读取订阅源
   - ✅ 任意网页：Jina Reader

4. **配置指南**
   - **代理**：`agent-reach configure proxy http://user:pass@ip:port`
   - **Twitter Cookie**：使用 Cookie-Editor 导出 Header String
   - **小红书**：需要 Docker + xiaohongshu-mcp

5. **禁止行为**
   - 不得使用主账号 Cookie（用专用账号）
   - 不得绕过平台速率限制
   - 不得在未配置代理的情况下访问被封锁平台

2. **标准流程**
   ```json
   {
     "agentId": "coder",
     "task": "明确具体的任务描述，包含输入/输出要求",
     "timeoutSeconds": 120,
     "label": "可选：任务标签，用于复用会话"
   }
   ```

3. **超时设置参考**
   - 简单查询（文件列表）：60 秒
   - 文件操作（读取/写入）：120 秒
   - 代码检查（语法/风格）：180 秒
   - 批量处理（多文件）：300 秒

4. **验收标准**
   - 子代理完成后会自动发送结果
   - 使用 `sessions_history` 查看详细执行过程
   - 使用 `subagents list` 查看子代理状态

5. **禁止行为**
   - 不得让主模型直接执行代码（应用 Codex）
   - 不得在子代理执行中频繁打断（等待完成）
   - 不得忽略超时设置（根据任务复杂度设置）

三、标准日常工作流（从 0 到稳定送达）
A. 快速健康检查（2 分钟）
1) `openclaw status`
- 确认 Gateway reachable，Dashboard URL 正常。
- 关注 Heartbeat 行：main 是否 enabled。
- 关注 Channel：qqbot 是否 enabled。

B. 遇到超出理解范围的问题（强制）
1) 先查 evomap（只读接入）
- 在 `tmp/evomap_ro/evomap` 中优先检索：`README.md` → `docs/*.ipynb` → `docs/*.md` → `src/**/*.py`
- 目标：拿到"标准输入格式/参数约束/最小示例/常见坑"再决定下一步动作。
2) 仍不确定再问用户
- 只问 1 个最关键的澄清问题，并说明默认假设与会导致的差异。


2) `openclaw cron list`
- 关注 Status：error / skipped 的占比。
- 任选 1 条关键任务（如 早安-主人）记下 jobId。

B. Cron 结构一致性校验（一次性 / 变更后必做）
- main → systemEvent
- isolated → agentTurn
如果发现不一致：先备份 jobs.json，再批量修（用 python 脚本，避免 PowerShell JSON 坑）。

C. 端到端送达验证（每次大改后必做）
1) 手动触发一条代表性 cron
- `openclaw cron run <jobId>`

2) 去 Dashboard → Chat(main) 看是否出现对应的 "System: Cron" 事件
- 有：说明 cron + main 消费 OK。
- 没有：说明 cron scheduler 或 main 消费有问题（看日志）。

3) 看 QQ 是否收到
- 收到：链路 OK。
- 没收到：优先查 delivery/announce + qqbot 通道配置。

四、QQBot 通道与"沙箱/正式"原则
重要：当前用户明确说明"现在的 QQ 就是沙箱"。
因此本 SOP 以"沙箱环境也必须送达到应投递的 openid/groupOpenid" 为目标。

你需要知道的点：
- `channels.qqbot.sandbox=true` 期望走 `https://sandbox.api.sgroup.qq.com`。
- 真实踩坑：本地 `C:\Users\Krox\.openclaw\extensions\qqbot\src\api.ts` 曾硬编码 `https://api.sgroup.qq.com`，导致即使 sandbox=true 也会去打正式 `/gateway`，并触发 401 + code=11298。
- 修复策略：插件必须从 `cfg.channels.qqbot.apiBaseUrl` / `cfg.channels.qqbot.sandbox` 计算 baseUrl（不要写死）。
- 如果发现沙箱导致无法送达，需要先和用户确认是否允许切正式；否则不要擅自切换。

通道配置查看：
- `openclaw config get channels.qqbot --json`

五、delivery/announce 的排障路径（QQ 收不到时按这套走）
1) 先确认 job 的 delivery 写对了
- 在 `C:\Users\Krox\.openclaw\cron\jobs.json` 找对应 jobId 的 `delivery`。
- 典型形态：
  {"channel":"qqbot","mode":"announce","to":"<openid>"}

2) 如果 UI(main chat) 有 Cron 文案但 QQ 不到：
- 说明 agent 已生成内容，但发送链路失败/未执行。
- 这时必须抓日志里和 qqbot 发送相关的错误码（401/11298 等）。

3) 日志抓取
- `openclaw logs --limit 2000 --plain --max-bytes 800000`
- 在日志里搜：qqbot / 11298 / 401 / send / delivery / announce

4) 典型错误
- code 11298：接口访问源 IP 不在白名单（用户说白名单已配好，则检查是否仍在用旧出口/代理）。
- auth/token mismatch：网关服务 token 与 config token 不一致（Windows Scheduled Task 可能保持旧 token）。
- gateway closed 1008 pairing required：说明你走了需要 pairing 的路径（qqbot 不支持 pairing → 避免该路径）。

六、Chrome Browser Relay（用于"用浏览器读"）工作流
目标：当 web_fetch 拿不到（动态页面/登录墙/X 等）时，用 Chrome relay 接管已有标签页读取。

1) 优先 web_fetch
- 能抓到就别上浏览器自动化。

2) 需要 relay 时
- 打开 Chrome 扩展 OpenClaw Browser Relay，确保 badge ON。
- 使用 `openclaw browser tabs --profile chrome` 应能看到 tabs。

3) 常见故障
- 18792 认证失败：token 不匹配 / gateway.auth 配置不同步。
- Windows Scheduled Task 的 token 同步问题：需要管理员权限执行 install --force（如果用户允许）。

七、cron store 改动规范（避免把系统修"更坏"）
- 每次批量改 `jobs.json` 前先备份：
  `C:\Users\Krox\.openclaw\cron\jobs.bak.<tag>.<timestamp>.json`
- 只做"最小修复"：
  1) 修 payload.kind vs sessionTarget
  2) 清 backoff/state 错误计数（在确认问题已解决后）
  3) 不改用户收件人映射，除非用户明确同意

八、缺失文件与恢复策略
- 如果 WORKFLOW_AUTO.md 丢失：按本文件重建。
- Daily memory：在 `workspace/memory/YYYY-MM-DD.md` 记录当天的变更、备份、关键日志片段。

九、当前已知事实（本机环境摘要）
- OpenClaw 版本：2026.2.19-2
- Gateway：ws://127.0.0.1:18789（loopback）
- Dashboard：http://127.0.0.1:18789/
- Chrome relay：ws://127.0.0.1:18792/cdp
- Cron store：C:\Users\Krox\.openclaw\cron\jobs.json

十、待办（下一步怎么继续把 QQ 送达修好）
1) 在"用户坚持沙箱"的前提下：确认沙箱环境的 qqbot 能否向当前 openid 送达。
2) 用 `openclaw cron run <早安jobId>` 触发后：
- Dashboard(main chat) 确认生成；
- openclaw logs 抓 qqbot API 返回码；
- 以返回码为准修（IP 白名单/鉴权/目标 openid 类型）。
3) 修好后，把"端到端验收步骤"固化成每日巡检（status + cron list + 触发 1 条）。
