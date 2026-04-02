$serviceProcess = Start-Process -FilePath "node" -ArgumentList "server.js" -WindowStyle Hidden -PassThru
$serviceProcess.Id | Out-File -FilePath "server.pid"
Write-Host "TaskManage background service started successfully. PID: $($serviceProcess.Id)"
