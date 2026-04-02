@echo off
cd /d "%~dp0"
powershell.exe -ExecutionPolicy Bypass -File "stop_service.ps1"
pause
