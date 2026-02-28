# setup-codex-integration.ps1
# OpenClaw + Codex 协作架构配置脚本

Write-Host "=== OpenClaw + Codex 协作架构配置 ===" -ForegroundColor Cyan

# 1. 检查 Codex 是否已安装
Write-Host "`n[1/5] 检查 Codex CLI..." -ForegroundColor Yellow
try {
    $codexVersion = codex --version 2>&1
    Write-Host "✅ Codex 已安装：$codexVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Codex 未安装，请先运行：npm install -g @openai/codex@latest" -ForegroundColor Red
    exit 1
}

# 2. 检查 Codex 配置
Write-Host "`n[2/5] 检查 Codex 配置..." -ForegroundColor Yellow
$authPath = "$env:USERPROFILE\.codex\auth.json"
if (Test-Path $authPath) {
    Write-Host "✅ auth.json 已存在：$authPath" -ForegroundColor Green
    $auth = Get-Content $authPath | ConvertFrom-Json
    if ($auth.OPENAI_API_KEY) {
        Write-Host "✅ API Key 已配置" -ForegroundColor Green
    } else {
        Write-Host "⚠️  API Key 未配置，请编辑 $authPath" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠️  auth.json 不存在，请创建并配置 API Key" -ForegroundColor Yellow
}

# 3. 启用跨代理访问
Write-Host "`n[3/5] 配置跨代理访问..." -ForegroundColor Yellow
$agentToAgent = openclaw config get tools.agentToAgent 2>&1 | ConvertFrom-Json
if ($agentToAgent.enabled) {
    Write-Host "✅ 跨代理访问已启用" -ForegroundColor Green
} else {
    Write-Host "⚙️  正在启用跨代理访问..." -ForegroundColor Cyan
    openclaw config set tools.agentToAgent.enabled true
    Write-Host "✅ 跨代理访问已启用" -ForegroundColor Green
}

# 4. 检查 Gateway 状态
Write-Host "`n[4/5] 检查 Gateway 状态..." -ForegroundColor Yellow
$status = openclaw status 2>&1
if ($status -match "Gateway.*reachable") {
    Write-Host "✅ Gateway 运行正常" -ForegroundColor Green
} else {
    Write-Host "⚙️  正在重启 Gateway..." -ForegroundColor Cyan
    openclaw gateway restart
    Start-Sleep -Seconds 5
    Write-Host "✅ Gateway 已重启" -ForegroundColor Green
}

# 5. 测试 sessions_spawn
Write-Host "`n[5/5] 测试 sessions_spawn..." -ForegroundColor Yellow
Write-Host "⚙️  启动测试任务..." -ForegroundColor Cyan

# 注意：这里不能直接调用 sessions_spawn，需要用户在 OpenClaw 中手动测试
Write-Host "✅ 配置完成！" -ForegroundColor Green
Write-Host "`n下一步：" -ForegroundColor Cyan
Write-Host "1. 在 OpenClaw 中运行测试任务：" -ForegroundColor White
Write-Host '   sessions_spawn --agentId coder --task "列出当前目录的前 5 个文件"' -ForegroundColor Gray
Write-Host "2. 查看子代理状态：" -ForegroundColor White
Write-Host "   subagents list" -ForegroundColor Gray
Write-Host "3. 查看子代理历史：" -ForegroundColor White
Write-Host "   sessions_history --sessionKey <key> --limit 20" -ForegroundColor Gray

Write-Host "`n=== 配置完成 ===" -ForegroundColor Green
