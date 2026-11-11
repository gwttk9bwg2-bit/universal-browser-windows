@echo off
set "UB_ROOT=%~dp0.."
node "%UB_ROOT%\dist\native-host.js" %*
