# day1global-tech-earnings (科技股财报深度分析)

基于 Day1Global 的科技股财报深度分析与多视角投资备忘录系统（v3.0）。

## 功能

- **16 大分析模块**（A-P）：收入质量、盈利能力、现金流、前瞻指引、竞争格局等
- **6 大投资哲学视角**：巴菲特/芒格、Baillie Gifford、Tiger Cubs、Klarman 等
- **多方法估值矩阵**：Owner Earnings、PEG、反向 DCF、EV/EBITDA、Rule of 40
- **反偏见框架**：6 大认知陷阱、7 大财务红旗、Pre-Mortem 事前尸检
- **可执行决策**：Action Price、建仓节奏、加仓/减仓触发条件
- **自动数据抓取**：集成 Alpha Vantage + FMP API，自动获取财报数据

## 使用方法

### Python 脚本

```bash
# 安装依赖
pip install -r requirements.txt

# 分析个股
python scripts/analyze_tech_earnings.py --ticker NVDA

# 输出到文件
python scripts/analyze_tech_earnings.py --ticker AAPL --output aapl_analysis.md
```

### 参数

| 参数 | 说明 |
|------|------|
| `--ticker` | 股票代码（如 NVDA、AAPL、MSFT） |
| `--output` | 输出文件路径（默认：输出到控制台） |

## 触发条件

当用户询问以下类型的问题时，使用此技能：
- "帮我看看 NVDA 最新财报"
- "META 这季度表现如何？"
- "该不该继续持有 MSFT？"
- "帮我做个 AAPL 的 deep dive"
- "GOOGL 现在贵不贵？"
- "投资大师怎么看 AMZN？"

## 输出结构

```markdown
# [股票代码] 财报深度分析

## 1. 执行摘要与 TL;DR
- 公司基本信息
- 当前股价和关键数据

## 2. Key Forces（决定性力量）
- 1-3 个改变公司价值的关键力量

## 3. 16 大模块分析（A-P）
- 模块 A：收入规模与质量分析
- 模块 B：盈利能力与利润率趋势
- 模块 C：现金流与资本配置
- ...（其他模块）

## 4. 估值矩阵
- P/E、PEG、P/B、P/S、EV/EBITDA、FCF Yield

## 5. 6 大投资哲学视角
- 质量复利（巴菲特/芒格）
- 想象力成长（Baillie Gifford）
- 基本面多空（Tiger Cubs）
- 深度价值（Klarman/Marks）
- 催化剂驱动（Tepper/Ackman）
- 宏观战术（Druckenmiller）

## 6. 反偏见检查
- 6 大认知陷阱
- 7 大财务红旗

## 7. 决策框架
- 持仓分类
- Action Price
- 长期监控变量
```

## 依赖

- Python 3.10+
- `pip install -r requirements.txt`
- 原始 skill 文件：`tech-earnings-deepdive/`

### API Keys

已配置：
- Alpha Vantage (实时股价)
- Financial Modeling Prep (财报数据)

可选：
- yfinance (Yahoo Finance 数据)

## 参考

- 原始项目：https://github.com/star23/Day1Global-Skills
- 免责声明：本技能生成的分析仅供参考，不构成投资建议
