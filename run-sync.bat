@echo off
cd /d "%~dp0"
echo ================================================== >> sync.log
echo [%date% %time%] Bat dau tu dong cap nhat du lieu YouTube... >> sync.log
node sync-channels.js >> sync.log 2>&1
echo [%date% %time%] Hoan tat tien trinh. >> sync.log
