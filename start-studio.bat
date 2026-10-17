@echo off
echo ============================================================
echo   ⚡ Starting Aura Media Studio (Desktop & Web App)...
echo ============================================================
cd /d "%~dp0"
start "Aura Media Studio Server" /B node server.js
timeout /t 2 /nobreak >nul
start http://localhost:4000
echo.
echo Media Studio is running at: http://localhost:4000
echo Press any key to stop the server when done.
pause >nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :4000') do taskkill /f /pid %%a >nul 2>&1
