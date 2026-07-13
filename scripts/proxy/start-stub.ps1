$ErrorActionPreference = 'Continue'

$nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCmd) { Write-Host 'node.exe not found in PATH' -ForegroundColor Red; exit 1 }
$nodeExe = $nodeCmd.Source
Write-Host ("node.exe = " + $nodeExe) -ForegroundColor DarkGray

# Portable paths â€” derived from $PSScriptRoot and $env:TEMP, never hardcoded.
$ScriptDir = $PSScriptRoot
$Stub = Join-Path $ScriptDir 'proxy-stub.js'
$LogFile = Join-Path $env:TEMP 'ag-proxy-stub.log'
$OutFile = Join-Path $env:TEMP 'ag-proxy-stub.out'
$ErrFile = Join-Path $env:TEMP 'ag-proxy-stub.err'

if (-not (Test-Path $Stub)) {
  Write-Host ("proxy-stub.js not found at: " + $Stub) -ForegroundColor Red
  Write-Host 'Run this script from the project root directory.' -ForegroundColor Yellow
  exit 1
}

# Free port 50999
Get-NetTCPConnection -LocalPort 50999 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Write-Host ("killing PID " + $_.OwningProcess + " on 50999"); Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
# Kill any previous stub node process
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'proxy-stub' } |
  ForEach-Object { Write-Host ("killing previous stub pid=" + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1

Start-Process -FilePath $nodeExe -ArgumentList "`"$Stub`"" -WindowStyle Hidden `
  -RedirectStandardOutput $OutFile `
  -RedirectStandardError $ErrFile
Write-Host 'Stub launched.' -ForegroundColor Cyan
Write-Host ("  stub=" + $Stub) -ForegroundColor DarkGray
Write-Host ("  log =" + $LogFile) -ForegroundColor DarkGray

Write-Host 'Waiting for 127.0.0.1:50999...' -ForegroundColor Cyan
$ready = $false
for ($i = 1; $i -le 20; $i++) {
  $tcp = $null
  try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $iar = $tcp.BeginConnect('127.0.0.1', 50999, $null, $null)
    if ($iar.AsyncWaitHandle.WaitOne(800, $false)) { $tcp.EndConnect($iar); $ready = $true; Write-Host ("  OPEN after {0}s" -f $i) -ForegroundColor Green; break }
  } catch {} finally { if ($tcp) { $tcp.Close() } }
  Start-Sleep -Seconds 1
}
if (-not $ready) {
  Write-Host 'Port 50999 did NOT open. Logs:' -ForegroundColor Red
  if (Test-Path $LogFile) { Get-Content $LogFile }
  if (Test-Path $ErrFile) { Get-Content $ErrFile }
  exit 1
}

try {
  $r = Invoke-WebRequest -Uri 'http://127.0.0.1:50999/health' -UseBasicParsing -TimeoutSec 3
  Write-Host ("  /health -> " + $r.StatusCode + " " + $r.Content) -ForegroundColor Green
} catch { Write-Host "  /health probe failed: $($_.Exception.Message)" -ForegroundColor Yellow }

Write-Host ''
Write-Host '== ag-doctor doctor ==' -ForegroundColor Cyan
$agDoctor = Join-Path $PSScriptRoot '..\..\ag-doctor\bin\ag-doctor.js'
if (Test-Path $agDoctor) {
  & $nodeExe $agDoctor doctor
} else {
  Write-Host ("ag-doctor not found at: " + $agDoctor) -ForegroundColor Yellow
}

Write-Host ''
Write-Host ('(Proxy stub log: ' + $LogFile + ')') -ForegroundColor DarkGray
