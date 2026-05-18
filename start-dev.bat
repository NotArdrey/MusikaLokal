@echo off
setlocal

set "PROJECT_ROOT=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_ROOT%open-vscode-dev.ps1" %*

endlocal
