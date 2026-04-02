Write-Host "开始构建 TaskManage 局域网纯净英文脚本包" -ForegroundColor Cyan
$projectName = "TaskManage_Release"
$outputDir = ".\$projectName"

if (Test-Path $outputDir) { Remove-Item -Recurse -Force $outputDir }
New-Item -ItemType Directory -Path $outputDir | Out-Null

Copy-Item "server.js" -Destination $outputDir
Copy-Item "database.js" -Destination $outputDir
Copy-Item "package.json" -Destination $outputDir
Copy-Item "package-lock.json" -Destination $outputDir
Copy-Item -Recurse "public" -Destination $outputDir
Copy-Item -Recurse "node_modules" -Destination $outputDir

$batScript = @"
@echo off
title TaskManage Local Server (DO NOT CLOSE)
color 0b
echo =======================================================
echo          TaskManage Collaboration Server
echo =======================================================
echo.
echo [INFO] Please DO NOT close this black console window!
echo [INFO] Ensure Node.js is installed on your Windows.
echo.
echo -------------------- Access Links ---------------------
echo [LAN Access]  For colleagues: http://[Your-LAN-IP]:3000 
echo [Local Access] For this PC:   http://localhost:3000
echo -------------------------------------------------------
echo.
node server.js
pause
"@

Set-Content -Path "$outputDir\start.bat" -Value $batScript -Encoding Default

$zipFileName = "$projectName.zip"
if (Test-Path $zipFileName) { Remove-Item -Force $zipFileName }
Compress-Archive -Path "$outputDir\*" -DestinationPath $zipFileName
Write-Host "重建打包成功：$zipFileName 已经使用了 100% 英文防乱码BAT脚本！" -ForegroundColor Green
