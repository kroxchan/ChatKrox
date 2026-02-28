@echo off
REM cron-run-safe.bat
REM 解决 openclaw cron run 卡住问题：超时自动终止
REM 
REM 用法:
REM   scripts\cron-run-safe.bat <jobId> [timeout_seconds] [output_file]
REM
REM 示例:
REM   scripts\cron-run-safe.bat a5693687-f710-4c40-81c7-c96aff869043 90
REM   scripts\cron-run-safe.bat a5693687-f710-4c40-81c7-c96aff869043 90 tmp\cron-run-log.txt

setlocal

set JOB_ID=%1
set TIMEOUT=%2
set OUTPUT=%3

if "%JOB_ID%"=="" (
    echo 用法：scripts\cron-run-safe.bat ^<jobId^> [timeout_seconds] [output_file]
    echo 示例：scripts\cron-run-safe.bat a5693687-f710-4c40-81c7-c96aff869043 90
    exit /b 1
)

if "%TIMEOUT%"=="" set TIMEOUT=90

echo [%date% %time%] 开始执行 cron run: %JOB_ID% (超时 %TIMEOUT%s^)

REM 使用 PowerShell 后台执行 + 超时
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds %TIMEOUT%" &
set PS_WAIT=%ERRORLEVEL%

REM 后台执行 cron run
start /B cmd /C "openclaw cron run %JOB_ID% 2>&1 > %%TEMP%%\cron-run-%JOB_ID%.txt"
set CRON_PID=!ERRORLEVEL!

REM 等待超时
timeout /t %TIMEOUT% /nobreak >nul

REM 检查是否完成
tasklist /FI "PID eq %CRON_PID%" 2>nul | find "%CRON_PID%" >nul
if %ERRORLEVEL%==0 (
    echo [%date% %time%] ⚠️ 超时 (%TIMEOUT%s^)，终止任务...
    taskkill /F /PID %CRON_PID% >nul 2>&1
    echo [%date% %time%] 任务已终止
) else (
    echo [%date% %time%] 任务已完成
)

REM 输出结果
if exist %TEMP%\cron-run-%JOB_ID%.txt (
    type %TEMP%\cron-run-%JOB_ID%.txt
    if not "%OUTPUT%"=="" (
        copy %TEMP%\cron-run-%JOB_ID%.txt "%OUTPUT%" >nul
    )
    del %TEMP%\cron-run-%JOB_ID%.txt
)

endlocal
