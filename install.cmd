@echo off
setlocal
cd /d "%~dp0"
echo Installing Universal Browser for the current Windows user...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-windows.ps1" -SkipExtensionPrompt
if errorlevel 1 (
  echo.
  echo Installation failed. See the message above.
  pause
  exit /b 1
)
echo.
echo Installation completed.
echo Restart Codex, then ask it to use the browser. No Dashboard step is required.
pause
