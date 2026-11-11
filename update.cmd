@echo off
setlocal
cd /d "%~dp0"
echo Updating Universal Browser from this release package...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update-windows.ps1"
if errorlevel 1 (
  echo Update failed. See the message above.
  pause
  exit /b 1
)
pause
