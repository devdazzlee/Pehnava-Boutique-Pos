@echo off
REM Pehnava Print Server — client laptop setup (no PowerShell)
title Pehnava Print Server Setup

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo [ERROR] Run as Administrator:
    echo   Right-click SETUP-CLIENT-LAPTOP.bat ^> Run as administrator
    echo.
    pause
    exit /b 1
)

cd /d "%~dp0"
echo.
echo Folder: %CD%
echo.

where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Node.js is not installed. Get it from https://nodejs.org/
    pause
    exit /b 1
)

echo Node:
node --version
echo.
echo Installing packages, testing server, installing Windows service...
echo Do not close this window.
echo.

node setup-client.js
set RESULT=%errorLevel%

echo.
if %RESULT% neq 0 (
    echo Setup failed. Read the messages above.
    echo Logs: %CD%\daemon\*.log
) else (
    echo Setup OK. Test: http://localhost:3001/health
)
echo.
pause
exit /b %RESULT%
