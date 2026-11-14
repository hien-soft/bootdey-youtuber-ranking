# setup-cron-windows.ps1
# Script tự động tạo Cronjob trên Windows Task Scheduler
# Chạy tự động mỗi ngày lúc 07:00 sáng

$taskName = "YouTube_Ranking_Daily_Sync"
$scriptDir = $PSScriptRoot
$batchPath = Join-Path $scriptDir "run-sync.bat"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  THIẾT LẬP CRONJOB TỰ ĐỘNG CẬP NHẬT YOUTUBE" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

if (-not (Test-Path $batchPath)) {
    Write-Host "Lỗi: Không tìm thấy tệp run-sync.bat!" -ForegroundColor Red
    exit 1
}

# Tạo Scheduled Task chạy lúc 07:00 sáng hàng ngày
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$batchPath`""
$trigger = New-ScheduledTaskTrigger -Daily -At 7:00AM
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

try {
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Tự động cập nhật số liệu YouTube Ranking vào Supabase lúc 07:00 sáng mỗi ngày" -Force
    Write-Host "`n✅ [THÀNH CÔNG] Đã đăng ký Cronjob trên Windows thành công!" -ForegroundColor Green
    Write-Host "👉 Tên tác vụ: $taskName" -ForegroundColor Yellow
    Write-Host "👉 Lịch trình: 07:00 sáng mỗi ngày" -ForegroundColor Yellow
    Write-Host "👉 File nhật ký: sync.log" -ForegroundColor Yellow
    Write-Host "==================================================" -ForegroundColor Cyan
} catch {
    Write-Host "Lỗi khi đăng ký Task: $($_.Exception.Message)" -ForegroundColor Red
}
