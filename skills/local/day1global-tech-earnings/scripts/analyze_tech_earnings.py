#!/usr/bin/env python3
"""
Day1Global 科技股财报深度分析脚本

用法：
    python analyze_tech_earnings.py --ticker NVDA

输出：
    结构化的财报分析报告（Markdown 格式）
"""

import argparse
import sys
import requests
from pathlib import Path
from datetime import datetime

# API Keys
ALPHA_VANTAGE_KEY = "Z4NAZAG0HF7O6UTF"
FMP_KEY = "apOAfbcIFekM1RrZlcU2sgmcFoPiWD7A"

# 增加 Yahoo Finance 支持
try:
    import yfinance as yf
    YF_AVAILABLE = True
except ImportError:
    YF_AVAILABLE = False
    print("⚠️  yfinance 未安装，运行：pip install yfinance")

# 技能根目录
SKILL_ROOT = Path(__file__).resolve().parents[1]


def fetch_income_statement(ticker: str) -> dict:
    """从 FMP 获取利润表数据"""
    url = f"https://financialmodelingprep.com/api/v3/income-statement/{ticker}?limit=4&apikey={FMP_KEY}"
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        return {"error": str(e)}


def fetch_balance_sheet(ticker: str) -> dict:
    """从 FMP 获取资产负债表数据"""
    url = f"https://financialmodelingprep.com/api/v3/balance-sheet-statement/{ticker}?limit=4&apikey={FMP_KEY}"
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        return {"error": str(e)}


def fetch_cash_flow(ticker: str) -> dict:
    """从 FMP 获取现金流量表数据"""
    url = f"https://financialmodelingprep.com/api/v3/cash-flow-statement/{ticker}?limit=4&apikey={FMP_KEY}"
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        return {"error": str(e)}


def fetch_key_metrics(ticker: str) -> dict:
    """从 FMP 获取关键财务指标"""
    url = f"https://financialmodelingprep.com/api/v3/key-metrics-ttm/{ticker}?apikey={FMP_KEY}"
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        return {"error": str(e)}


def fetch_quote(ticker: str) -> dict:
    """从 Alpha Vantage 获取实时股价"""
    url = f"https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={ticker}&apikey={ALPHA_VANTAGE_KEY}"
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        return data.get("Global Quote", {})
    except Exception as e:
        return {"error": str(e)}


def fetch_yahoo_info(ticker: str) -> dict:
    """从 Yahoo Finance 获取公司信息"""
    if not YF_AVAILABLE:
        return {"error": "yfinance not installed"}
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        return {
            "sector": info.get('sector', 'N/A'),
            "industry": info.get('industry', 'N/A'),
            "marketCap": info.get('marketCap', 'N/A'),
            "enterpriseValue": info.get('enterpriseValue', 'N/A'),
            "beta": info.get('beta', 'N/A'),
            "52WeekHigh": info.get('fiftyTwoWeekHigh', 'N/A'),
            "52WeekLow": info.get('fiftyTwoWeekLow', 'N/A'),
            "analystRating": info.get('recommendationKey', 'N/A'),
            "targetPrice": info.get('targetHighPrice', 'N/A'),
        }
    except Exception as e:
        return {"error": str(e)}


def calculate_valuation(ticker: str, metrics: dict, quote: dict) -> dict:
    """计算多种估值方法"""
    valuation = {}
    
    # 从指标中提取数据
    if "error" not in metrics and metrics and len(metrics) > 0:
        m = metrics[0]
        
        # PEG Ratio
        pe = m.get('priceEarningsRatio')
        growth = m.get('revenueGrowthTTM')
        if pe and growth and growth > 0:
            valuation['PEG'] = pe / (growth * 100)
        else:
            valuation['PEG'] = "N/A"
        
        # EV/EBITDA
        valuation['EV/EBITDA'] = m.get('enterpriseValueOverEBITDA', 'N/A')
        
        # P/B
        valuation['P/B'] = m.get('priceToBookRatio', 'N/A')
        
        # P/S
        valuation['P/S'] = m.get('priceToSalesRatio', 'N/A')
        
        # Free Cash Flow Yield
        fcf_per_share = m.get('freeCashFlowPerShare')
        price = quote.get('05. price') if "error" not in quote else None
        if fcf_per_share and price:
            try:
                valuation['FCF Yield'] = fcf_per_share / float(price) * 100
            except:
                valuation['FCF Yield'] = "N/A"
        else:
            valuation['FCF Yield'] = "N/A"
    
    return valuation


def assess_investment_philosophies(ticker: str, metrics: dict, valuation: dict) -> dict:
    """6 大投资哲学视角评估"""
    philosophies = {}
    
    if "error" not in metrics and metrics and len(metrics) > 0:
        m = metrics[0]
        
        # 1. 质量复利（巴菲特/芒格）
        roe = m.get('returnOnEquity')
        margin = m.get('netProfitMargin')
        debt_to_equity = m.get('debtToEquity')
        
        score = 0
        if roe and roe > 0.15: score += 1
        if margin and margin > 0.15: score += 1
        if debt_to_equity and debt_to_equity < 0.5: score += 1
        
        philosophies['质量复利'] = {
            '评分': f"{score}/3",
            '关键指标': f"ROE={roe}, 净利率={margin}, 负债权益比={debt_to_equity}",
            '建议': '适合长期持有' if score >= 2 else '需进一步分析'
        }
        
        # 2. 想象力成长（Baillie Gifford）
        revenue_growth = m.get('revenueGrowthTTM')
        
        philosophies['想象力成长'] = {
            '评分': '高' if revenue_growth and revenue_growth > 0.2 else '中' if revenue_growth and revenue_growth > 0.1 else '低',
            '关键指标': f"收入增长={revenue_growth}",
            '建议': '关注 TAM 和市场渗透率'
        }
        
        # 3. 基本面多空（Tiger Cubs）
        pe = m.get('priceEarningsRatio')
        peg = valuation.get('PEG')
        
        philosophies['基本面多空'] = {
            '评分': '吸引' if pe and pe < 15 else '中性',
            '关键指标': f"P/E={pe}, PEG={peg}",
            '建议': '等待更好买点' if pe and pe > 20 else '可以建仓'
        }
        
        # 4. 深度价值（Klarman/Marks）
        pb = m.get('priceToBookRatio')
        ps = m.get('priceToSalesRatio')
        
        philosophies['深度价值'] = {
            '评分': '吸引' if pb and pb < 1.5 else '中性',
            '关键指标': f"P/B={pb}, P/S={ps}",
            '建议': '关注安全边际'
        }
        
        # 5. 催化剂驱动（Tepper/Ackman）
        philosophies['催化剂驱动'] = {
            '评分': '待观察',
            '关键指标': '需要分析近期催化剂',
            '建议': '关注财报、产品发布、并购消息'
        }
        
        # 6. 宏观战术（Druckenmiller）
        philosophies['宏观战术'] = {
            '评分': '待分析',
            '关键指标': '美联储政策、通胀数据',
            '建议': '关注利率走向和美元走势'
        }
    
    return philosophies


def analyze_tech_earnings(ticker: str) -> str:
    """
    分析科技股财报

    Args:
        ticker: 股票代码（如 NVDA、AAPL、MSFT）

    Returns:
        Markdown 格式的分析报告
    """
    print(f"📊 正在分析 {ticker}...")
    
    # 获取数据
    print("  📈 获取财务数据...")
    income = fetch_income_statement(ticker)
    balance = fetch_balance_sheet(ticker)
    cash_flow = fetch_cash_flow(ticker)
    metrics = fetch_key_metrics(ticker)
    quote = fetch_quote(ticker)
    yahoo_info = fetch_yahoo_info(ticker)
    
    # 计算估值
    print("  💰 计算估值矩阵...")
    valuation = calculate_valuation(ticker, metrics, quote)
    
    # 投资哲学评估
    print("  🎯 评估投资哲学视角...")
    philosophies = assess_investment_philosophies(ticker, metrics, valuation)
    
    # 生成报告
    report = generate_report(ticker, income, balance, cash_flow, metrics, quote, valuation, philosophies, yahoo_info)
    
    return report


def format_currency(value) -> str:
    """格式化货币金额"""
    if value is None:
        return "N/A"
    try:
        val = float(value)
        if abs(val) >= 1e9:
            return f"${val/1e9:.2f}B"
        elif abs(val) >= 1e6:
            return f"${val/1e6:.2f}M"
        else:
            return f"${val:.2f}"
    except:
        return str(value)


def generate_report(ticker: str, income: dict, balance: dict, cash_flow: dict, 
                    metrics: dict, quote: dict, valuation: dict, philosophies: dict,
                    yahoo_info: dict) -> str:
    """生成分析报告"""
    
    report = f"""# {ticker} 财报深度分析

**生成时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

---

## 1. 执行摘要与 TL;DR

### 公司基本信息
"""
    
    # 公司信息
    if "error" not in yahoo_info and yahoo_info:
        report += f"""
- **行业**: {yahoo_info.get('sector', 'N/A')}
- **子行业**: {yahoo_info.get('industry', 'N/A')}
- **市值**: {format_currency(yahoo_info.get('marketCap'))}
- **企业价值**: {format_currency(yahoo_info.get('enterpriseValue'))}
- **Beta**: {yahoo_info.get('beta', 'N/A')}
- **分析师评级**: {yahoo_info.get('analystRating', 'N/A')}
- **目标价**: ${yahoo_info.get('targetPrice', 'N/A')}
"""
    
    report += """
### 关键数据
"""
    
    # 股价信息
    if "error" not in quote and quote:
        report += f"""
- **当前股价**: ${quote.get('05. price', 'N/A')}
- **涨跌幅**: {quote.get('10. change percent', 'N/A')}
- **成交量**: {quote.get('06. volume', 'N/A')}
- **52 周高**: ${yahoo_info.get('52WeekHigh', 'N/A')}
- **52 周低**: ${yahoo_info.get('52WeekLow', 'N/A')}
"""
    
    # 收入数据
    if "error" not in income and income and len(income) > 0:
        latest = income[0]
        report += f"""
### 收入趋势（最近 4 季度）
| 季度 | 收入 | YoY 增长 | 净利润 | 净利率 |
|------|------|---------|--------|--------|
"""
        for period in income[:4]:
            date = period.get('date', 'N/A')[:10]
            revenue = format_currency(period.get('revenue'))
            growth = period.get('revenueGrowth', 'N/A')
            if isinstance(growth, float):
                growth = f"{growth*100:.1f}%"
            net_income = format_currency(period.get('netincome'))
            margin = period.get('netProfitRatio', 'N/A')
            if isinstance(margin, float):
                margin = f"{margin*100:.1f}%"
            report += f"| {date} | {revenue} | {growth} | {net_income} | {margin} |\n"
    
    # 关键指标
    if "error" not in metrics and metrics and len(metrics) > 0:
        m = metrics[0]
        report += f"""

### 关键财务指标（TTM）
| 指标 | 数值 |
|------|------|
| P/E Ratio | {m.get('priceEarningsRatio', 'N/A')} |
| P/B Ratio | {m.get('priceToBookRatio', 'N/A')} |
| P/S Ratio | {m.get('priceToSalesRatio', 'N/A')} |
| EV/EBITDA | {m.get('enterpriseValueOverEBITDA', 'N/A')} |
| ROE | {m.get('returnOnEquity', 'N/A')} |
| ROA | {m.get('returnOnAssets', 'N/A')} |
| 毛利率 | {m.get('grossProfitMargin', 'N/A')} |
| 净利率 | {m.get('netProfitMargin', 'N/A')} |
| 自由现金流 | {format_currency(m.get('freeCashFlowPerShare'))} |
"""
    
    report += """

---

## 2. Key Forces（决定性力量）

> **待分析**: 未来 3-5 年，有哪 1-3 个力量会根本性地改变这家公司的价值？

- [ ] AI/技术范式转移正在重塑这个行业
- [ ] 监管政策正在创造或摧毁价值
- [ ] 管理层正在执行一个市场尚未定价的战略转向
- [ ] 竞争格局正在根本性地改变
- [ ] 市场严重误解了某个结构性变化
- [ ] 隐藏资产存在未被市场定价的变现潜力

---

## 3. 16 大模块分析（A-P）

### 模块 A：收入规模与质量分析
- [ ] 各业务线收入构成拆解
- [ ] 增速趋势（连续 4-8 季度）
- [ ] 收入质量（经常性收入占比、有机增长）

### 模块 B：盈利能力与利润率趋势
- [ ] 毛利率、营业利润率、净利率趋势
- [ ] GAAP vs Non-GAAP 差异
- [ ] 盈利 vs 预期

### 模块 C：现金流与资本配置
- [ ] 经营性现金流 vs 净利润
- [ ] 自由现金流（FCF）
- [ ] 资本配置决策（回购/分红/并购）

### 模块 D-N：（待扩展）
参考 `tech-earnings-deepdive/SKILL.md` 完整框架。

---

## 4. 估值矩阵

| 方法 | 数值 | 行业平均 | 评估 |
|------|------|----------|------|
| P/E Ratio | {metrics[0].get('priceEarningsRatio', 'N/A') if "error" not in metrics and metrics else 'N/A'} | - | {'偏高' if isinstance(metrics[0].get('priceEarningsRatio'), (int, float)) and metrics[0]['priceEarningsRatio'] > 25 else '合理' if isinstance(metrics[0].get('priceEarningsRatio'), (int, float)) and metrics[0]['priceEarningsRatio'] > 15 else '偏低' if isinstance(metrics[0].get('priceEarningsRatio'), (int, float)) else '-'} |
| PEG Ratio | {valuation.get('PEG', 'N/A')} | 1.0 | {'高估' if isinstance(valuation.get('PEG'), (int, float)) and valuation['PEG'] > 1.5 else '合理' if isinstance(valuation.get('PEG'), (int, float)) and valuation['PEG'] > 0.8 else '低估' if isinstance(valuation.get('PEG'), (int, float)) else '-'} |
| P/B Ratio | {metrics[0].get('priceToBookRatio', 'N/A') if "error" not in metrics and metrics else 'N/A'} | - | - |
| P/S Ratio | {metrics[0].get('priceToSalesRatio', 'N/A') if "error" not in metrics and metrics else 'N/A'} | - | - |
| EV/EBITDA | {valuation.get('EV/EBITDA', 'N/A')} | - | - |
| FCF Yield | {valuation.get('FCF Yield', 'N/A')}% | - | - |

---

## 5. 6 大投资哲学视角

"""
    
    # 添加投资哲学评估
    if philosophies:
        for name, data in philosophies.items():
            report += f"""
### {name}
- **评分**: {data.get('评分', 'N/A')}
- **关键指标**: {data.get('关键指标', 'N/A')}
- **建议**: {data.get('建议', 'N/A')}
"""

---

## 6. 反偏见检查

### 6 大认知陷阱
- [ ] 确认偏误：只找支持自己观点的信息
- [ ] 锚定效应：过度依赖首次获得的信息
- [ ] 近期偏误：过度重视最近发生的事
- [ ] 损失厌恶：不愿承认错误
- [ ] 从众心理：跟随大众
- [ ] 过度自信：高估自己的判断

### 7 大财务红旗
- [ ] 收入增长但现金流下降
- [ ] 频繁的一次性调整
- [ ] 应收账款周转天数上升
- [ ] 存货异常增长
- [ ] 毛利率异常高于同行
- [ ] 大量股票期权费用
- [ ] 关联交易

---

## 7. 决策框架

### 持仓分类
- [ ] 核心持仓（长期持有）
- [ ] 卫星持仓（战术性）
- [ ] 观察名单
- [ ] 卖出

### Action Price
- 买入区间：$___ - $___
- 加仓触发：$___
- 减仓触发：$___
- 清仓触发：$___

### 长期监控变量
1. ___
2. ___
3. ___

---

## 数据来源
- Alpha Vantage: 实时股价
- Financial Modeling Prep: 财报数据、财务指标

---

**免责声明**: 本分析仅供参考，不构成投资建议。投资有风险，决策需谨慎。
"""
    
    return report


def main():
    parser = argparse.ArgumentParser(
        description='Day1Global 科技股财报深度分析',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python analyze_tech_earnings.py --ticker NVDA
  python analyze_tech_earnings.py --ticker AAPL --output aapl_analysis.md
        """
    )
    parser.add_argument('--ticker', type=str, required=True,
                        help='股票代码（如 NVDA、AAPL、MSFT）')
    parser.add_argument('--output', type=str, default=None,
                        help='输出文件路径（默认：输出到控制台）')

    args = parser.parse_args()

    # 生成分析报告
    report = analyze_tech_earnings(args.ticker)

    # 输出
    if args.output:
        output_path = Path(args.output)
        output_path.write_text(report, encoding='utf-8')
        print(f"✅ 分析报告已保存到：{output_path}")
    else:
        print(report)


if __name__ == '__main__':
    main()
