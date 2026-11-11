@echo off
setlocal
cd /d "%~dp0"
echo Connecting an existing signed-in Chrome or Edge browser...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-windows.ps1" -SkipDependencies -SkipSkillInstall -SkipCodexConfig
if errorlevel 1 (
  echo.
  echo Browser connection failed. See the message above.
  pause
  exit /b 1
)
echo.
echo Existing-browser connection completed. Restart the browser once.
pause
