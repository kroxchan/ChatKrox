# anti-lazy 防偷懒技能

> 强制多源搜索流程，防止 AI 凭印象回答

## 功能特性

- ✅ 强制 >=5 个独立信息源搜索
- ✅ 证据块输出（工具/命令/引用/置信度）
- ✅ 禁止凭印象回答
- ✅ 适用于法律/政策/新闻/地点/价格等查询场景

## 快速部署

### 1. 安装依赖

```bash
# 需要 bun 运行时
bun install
```

### 2. 配置环境变量

无需额外配置，使用 OpenClaw 内置工具。

### 3. 测试

```bash
bun scripts/multi_search.ts search --task "查询劳动合同法第 38 条" --mode strict
```

## 使用方法

### 在 OpenClaw 中使用

当遇到需要查证的问题时，自动触发多源搜索流程：

1. **web_search**：3+ 个不同关键词搜索
2. **web_fetch**：2+ 个相关页面抓取
3. **evomap**：查标准做法/类似案例
4. **browser**：登录墙/动态页面用 Chrome Relay
5. **专用工具**：AMap/Open-Meteo 等

### 输出格式

```markdown
## 证据块
- 来源 1: web_search "[关键词]" → [关键引用]
- 来源 2: web_fetch [URL] → [关键引用]
- ...
- 结论：[高/中/低置信度]
- 不足：[还有什么信息缺口]
- 下一步：[如需继续搜索]
```

## 文件结构

```
anti-lazy/
├── SKILL.md              # 技能说明
├── README.md             # 本文件
└── scripts/
    └── multi_search.ts   # 多源搜索脚本
```

## 示例

### 查询法律条款

```bash
bun scripts/multi_search.ts search --task "劳动合同法第 38 条规定" --mode strict
```

### 查询地点周边

```bash
bun scripts/multi_search.ts search --task "深圳市南山区科技园周边餐厅" --mode strict
```

## 注意事项

1. **必须 >=5 个信息源**，否则算偷懒
2. **必须输出证据块**，包含每个来源的关键引用
3. **不得凭印象回答**"没有/不可用/已确认"

## 许可证

MIT License

## 反馈

Issue: https://github.com/kroxchan/ChatKrox/issues
