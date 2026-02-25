# anti-lazy

防偷懒执行框架：Two-Phase（先计划后结果）+ Evidence Gate（强制证据门槛）

## 为什么需要它

AI 助理最大的风险不是“不会”，而是“偷懒式回答”（没查就说、没跑工具就下结论）。

anti-lazy 强制把工作流程变成：先执行，再回答；并且要求可复现证据。

## 用法（地点类：AMap Demo）

在 `ChatKrox` 仓库根目录运行：

```bash
bun skills/local/anti-lazy/scripts/anti_lazy.ts run --task "深圳市乐动力宝龙文体中心周边的川菜" --mode strict --radius 3000
```

- `--mode strict`：要求严格证据门槛（MVP 中用 >=5 条候选作为门槛）
- `--radius`：周边搜索半径，单位米

## 输出

- Phase A：执行计划（工具路由/参数/预计耗时）
- Phase B：结果摘要 + 证据块（可复现命令、关键字段、退出码）

> 默认会输出过程；若用于面向用户的最终交互，可在上层封装“只输出最终结果”。

## 依赖

- 已配置并可运行 `skills/local/amap`（AMap Web Service API）
- `AMAP_MAPS_API_KEY` 已设置

## Roadmap

- 解析 AMap JSON → 输出结构化店名/距离/地址列表
- strict 模式升级：真正 >=5 独立信息源（不仅是 >=5 条 POI）
- 默认把检索任务丢给 `rescue` 子代理并行搜证据
