# anti-lazy (Evidence Gate + Two-Phase)

目的：防止 agent 在“需要查证/需要工具”的问题上偷懒。

## 核心机制

1) Two-Phase 输出
- Phase A：先输出计划（将调用哪些工具/预计耗时/需要用户确认的参数）。
- Phase B：工具调用完成后输出最终答案 + 证据块。

2) Evidence Gate
- 对“信息检索/事实查询/地点周边/路线/报价/时间表/版本状态”等问题，必须提供：
  - 工具调用/命令列表
  - 每个来源的关键证据点
  - 结论 + 置信度
  - 不足与下一步
- 默认要求 >=5 个独立信息源；若无法满足，必须显式标注缺口并继续检索或请求用户补充。

3) Tool Routing
- 地点/周边/路线/POI：优先 AMap（`skills/local/amap`）。
- 动态/登录墙：优先 web_fetch；不行再浏览器 relay。

## 运行方式（开发态）

- 入口脚本：`bun skills/local/anti-lazy/scripts/anti_lazy.ts --help`

## 约束

- 不得凭印象给出“没有/不可用/已确认”等结论；必须先扫描本地 skill 库与可用工具。
- 出现 login/captcha/anti-bot/payment/transfer 关键词：停，收集证据再问。
