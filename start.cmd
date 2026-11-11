@echo off
setlocal
cd /d "%~dp0"
if exist "%LOCALAPPDATA%\UniversalBrowser\start.cmd" (
  call "%LOCALAPPDATA%\UniversalBrowser\start.cmd"
  exit /b %errorlevel%
)
if not exist "node_modules" (
  echo Please run install.cmd first.
  pause
  exit /b 1
)
start "" "http://127.0.0.1:3210"
node dist\cli.js serve
