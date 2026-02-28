# import-crypto-news-cron.ps1
# 导入加密新闻和 Twitter 热点 Cron 任务

$ErrorActionPreference = "Stop"

Write-Host "导入加密新闻 Cron 任务..." -ForegroundColor Green

# 加密新闻任务（9:25）
$newsJob = @{
    name = "晨报 C-加密新闻 (opennews)"
    schedule = @{
        kind = "cron"
        expr = "25 9 * * *"
        tz = "Asia/Shanghai"
    }
    sessionTarget = "isolated"
    wakeMode = "next-heartbeat"
    payload = @{
        kind = "agentTurn"
        message = @"
获取加密新闻并生成晨报 C 内容：

1. 调用 opennews API 获取最新加密新闻（limit=15）
2. 筛选 AI 评分>=80 的高影响力新闻
3. 输出格式：
   【加密新闻】
   1. [新闻源] 标题 (AI 评分，信号)
   2. ...
   
只输出前 10 条，不要任何系统说明。
"@
    }
    delivery = @{
        mode = "announce"
        channel = "wecom"
        to = "ChenZhengKang"
        bestEffort = $true
    }
} | ConvertTo-Json -Depth 10

# 保存任务配置
$newsJob | Out-File -FilePath "tmp\crypto-news-job.json" -Encoding utf8
Write-Host "已保存任务配置到 tmp\crypto-news-job.json" -ForegroundColor Yellow

Write-Host "`n手动导入命令:" -ForegroundColor Cyan
Write-Host "openclaw cron add --name `'晨报 C-加密新闻 (opennews)`' --cron `'25 9 * * *`' --session isolated --message `'获取加密新闻...`' --channel wecom --to ChenZhengKang --announce --best-effort-deliver"

Write-Host "`n注意：需要先设置环境变量 OPENNEWS_TOKEN 和 TWITTER_TOKEN" -ForegroundColor Red
Write-Host "获取 Token: https://6551.io/mcp"
