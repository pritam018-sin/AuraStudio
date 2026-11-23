@echo off
setlocal enabledelayedexpansion
title Aura Media Studio Launcher
echo ============================================================
echo   ⚡ Starting Aura Media Studio (Desktop & Web App)...
echo ============================================================
cd /d "%~dp0"

:: 1. Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo.
  echo [ERROR] Node.js is not installed or not found in system PATH.
  echo Please download and install Node.js from: https://nodejs.org
  echo.
  pause
  exit /b 1
)

:: 2. Ensure node_modules exists
if not exist "node_modules\" (
  echo [INFO] First-time setup: Installing required dependencies...
  call npm install
  if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
  )
)

:: 3. Check if server is already running on port 4000
netstat -ano | findstr /R /C:":4000 .*LISTENING" >nul 2>nul
if %errorlevel% equ 0 (
  echo [INFO] Aura Studio server is already running on port 4000!
  echo Opening browser...
  start http://localhost:4000
  goto :RUNNING_LOOP
)

:: 4. Start the server in a dedicated window so logs are clearly visible
echo [INFO] Launching server on http://localhost:4000 ...
start "Aura Studio Server" cmd /k "title Aura Studio Server [Port 4000] && node server.js"

:: 5. Wait for server to bind
set RETRIES=0
:WAIT_SERVER
timeout /t 1 /nobreak >nul
netstat -ano | findstr /R /C:":4000 .*LISTENING" >nul 2>nul
if %errorlevel% neq 0 (
  set /a RETRIES+=1
  if !RETRIES! lss 8 goto :WAIT_SERVER
)

:: 6. Open browser
start http://localhost:4000

:RUNNING_LOOP
echo.
echo ============================================================
echo   ✅ Aura Media Studio is actively running!
echo   🌐 Web Interface: http://localhost:4000
echo   📂 Downloads:   %~dp0downloads
echo ============================================================
echo.
echo  Keep the server window open while downloading media.
echo  To stop the server at any time, press 'S' and hit Enter.
echo.
set /p USER_CHOICE="Enter choice (S to stop, or close window): "
if /i "%USER_CHOICE%"=="S" (
  echo Stopping server on port 4000...
  for /f "tokens=5" %%a in ('netstat -aon ^| findstr /R /C:":4000 .*LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
  )
  echo ✅ Aura Studio stopped cleanly.
  timeout /t 2 /nobreak >nul
)

