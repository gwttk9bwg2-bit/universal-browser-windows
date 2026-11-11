@echo off
setlocal
echo Removing Universal Browser for the current Windows user...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\uninstall-windows.ps1"
if errorlevel 1 (
  echo Removal failed. See the message above.
  pause
  exit /b 1
)
pause
