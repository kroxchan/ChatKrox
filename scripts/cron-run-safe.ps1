#!/usr/bin/env pwsh
# cron-run-safe.ps1
# 解决 openclaw cron run 卡住问题：后台执行 + 超时自动终止 + 日志输出
# 
# 用法:
#   .\scripts\cron-run-safe.ps1 -JobId <jobId> [-TimeoutSeconds 60] [-OutputFile <path>]
#
# 示例:
#   .\scripts\cron-run-safe.ps1 -JobId a5693687-f710-4c40-81c7-c96aff869043 -TimeoutSeconds 90
#   .\scripts\cron-run-safe.ps1 -JobId a5693687-f710-4c40-81c7-c96aff869043 -OutputFile tmp\cron-run-log.txt

param(
    [Parameter(Mandatory = $true)]
    [string]$JobId,
    
    [int]$TimeoutSeconds = 90,
    
    [string]$OutputFile
)

$ErrorActionPreference = "Stop"

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] $Message"
    if ($OutputFile) {
        Add-Content -Path $OutputFile -Value "[$timestamp] $Message"
    }
}

Write-Log "开始执行 cron run: $JobId (超时 ${TimeoutSeconds}s)"

try {
    # 启动后台任务
    $job = Start-Job -ScriptBlock {
        param($id)
        $env:PYTHONIOENCODING = "utf-8"
        & openclaw cron run $id 2>&1
    } -ArgumentList $JobId
    
    Write-Log "任务已启动 (PID: $($job.Id))"
    
    # 等待完成或超时
    $completed = Wait-Job $job -Timeout $TimeoutSeconds
    
    if ($completed) {
        Write-Log "任务完成"
        $output = Receive-Job $job
        if ($output) {
            Write-Host $output
            if ($OutputFile) {
                $output | Out-File -FilePath $OutputFile -Append -Encoding utf8
            }
        }
        Remove-Job $job -Force
        Write-Log "任务已清理"
        exit 0
    } else {
        Write-Log "⚠️ 超时 (${TimeoutSeconds}s)，正在终止任务..."
        Stop-Job $job -Force
        Remove-Job $job -Force
        Write-Log "任务已终止并清理"
        exit 1
    }
} catch {
    Write-Log "❌ 错误：$_"
    if ($OutputFile) {
        $_ | Out-File -FilePath $OutputFile -Append -Encoding utf8
    }
    exit 1
}
