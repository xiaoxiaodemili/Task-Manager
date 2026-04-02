@echo off
cd /d "%~dp0"
echo Starting TaskManage background service...
powershell.exe -ExecutionPolicy Bypass -File "start_service.ps1"
echo Start command sent.
ping 127.0.0.1 -n 2 > nul
exit
