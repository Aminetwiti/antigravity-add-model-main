#Requires -Version 5.1
<#
.SYNOPSIS
    ag-doctor — fix-proxy: clears the system proxy and restarts Antigravity cleanly.

.DESCRIPTION
    Resets the WinHTTP proxy, kills any lingering Antigravity processes that may
    be holding port 50999, then relaunches the app. Use this when the bundled
    proxy (app.asar\dist\proxy.js) crashes with ERR_HTTP_HEADERS_SENT.
#>

$ErrorActionPreference = 'Stop'

Write-Host "[fix-proxy] resetting WinHTTP proxy..." -ForegroundColor Cyan
netsh winhttp reset proxy | Out-Null

Write-Host "[fix-proxy] killing Antigravity processes..." -ForegroundColor Cyan
Get-Process -Name 'Antigravity' -ErrorAction SilentlyContinue | ForEach-Object {
    try { Stop-Process -Id $_.Id -Force -ErrorAction Stop } catch {}
}

# Brief wait so the port is released
Start-Sleep -Milliseconds 800

$exe = Join-Path $env:LOCALAPPDATA 'Programs\antigravity\Antigravity.exe'
if (Test-Path $exe) {
    Write-Host "[fix-proxy] launching $exe" -ForegroundColor Green
    Start-Process -FilePath $exe
} else {
    Write-Warning "Antigravity.exe not found at $exe"
}
