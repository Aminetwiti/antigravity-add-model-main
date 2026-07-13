@echo off
REM Kill old forwarder and start new one
echo Killing old forwarder (PID 32568)...
taskkill /F /T /PID 32568 2>&1
timeout /t 3 /nobreak >nul

echo.
echo Starting new MITM forwarder...
cd /d "C:\Users\amine\Downloads\antigravity-add-model-main\antigravity-add-model-main"
node scripts\mitm\mitm_443.js
