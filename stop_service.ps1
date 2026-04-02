if (Test-Path "server.pid") {
    $pidToKill = Get-Content "server.pid"
    try {
        Stop-Process -Id $pidToKill -Force -ErrorAction Stop
        Write-Host "TaskManage service (PID $pidToKill) stopped successfully."
    } catch {
        Write-Host "Error stopping process $pidToKill, or it has already exited."
    }
    Remove-Item "server.pid"
} else {
    Write-Host "server.pid not found. Is the service running or already stopped?"
}
