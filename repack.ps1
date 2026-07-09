# Antigravity Model Support Patch Repack & Deploy Script
# This script now ALSO runs `npm run build` (tsc) before packing so that
# the bundled `dist/` is always in sync with `src/`. Without this step,
# the proxy in app.asar can be older than the source code.

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "Stopping all running Antigravity processes..." -ForegroundColor Yellow
Write-Host "==============================================" -ForegroundColor Cyan

# Terminate running app and language server processes
Stop-Process -Name "Antigravity" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "language_server" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "Building TypeScript (npm run build)..." -ForegroundColor Yellow
Write-Host "==============================================" -ForegroundColor Cyan

# Portable paths — derived from $PSScriptRoot, never hardcoded.
$SourceDir = $PSScriptRoot
$Node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $Node) {
    Write-Host "Node.js not found in PATH. Exiting." -ForegroundColor Red
    exit 1
}

if (Test-Path (Join-Path $SourceDir "package.json")) {
    Push-Location $SourceDir
    try {
        & $Node (Join-Path $SourceDir "node_modules\.bin\tsc") 2>&1 | Select-Object -Last 30
        if ($LASTEXITCODE -ne 0) {
            Write-Host "==============================================" -ForegroundColor Red
            Write-Host "Error: tsc build failed (exit $LASTEXITCODE)" -ForegroundColor Red
            Write-Host "==============================================" -ForegroundColor Red
            Pop-Location
            exit 1
        }
        Write-Host "  build OK" -ForegroundColor Green
    } finally {
        Pop-Location
    }
} else {
    Write-Host "  (no package.json found, skipping build)" -ForegroundColor DarkGray
}

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "Repacking app.asar package..." -ForegroundColor Yellow
Write-Host "==============================================" -ForegroundColor Cyan

$DestAsar = Join-Path $env:LOCALAPPDATA "Programs\antigravity\resources\app.asar"

if (-not (Test-Path $SourceDir)) {
    Write-Host "==============================================" -ForegroundColor Red
    Write-Host "Error: Source directory not found at $SourceDir" -ForegroundColor Red
    Write-Host "==============================================" -ForegroundColor Red
    exit 1
}

# Repack using @electron/asar (excluding large/unnecessary directories)
& npx -y @electron/asar pack $SourceDir $DestAsar --unpack-dir "{node_modules,scratch,.git}"

if ($LASTEXITCODE -eq 0) {
    Write-Host "==============================================" -ForegroundColor Cyan
    Write-Host "Success! app.asar repacked successfully." -ForegroundColor Green
    Write-Host "Restarting Antigravity..." -ForegroundColor Yellow
    Write-Host "==============================================" -ForegroundColor Cyan

    $ExePath = Join-Path $env:LOCALAPPDATA "Programs\antigravity\Antigravity.exe"
    if (Test-Path $ExePath) {
        Start-Process -FilePath $ExePath
    } else {
        Write-Host ("Warning: Antigravity.exe not found at " + $ExePath) -ForegroundColor Yellow
        Write-Host "Please restart Antigravity manually." -ForegroundColor Yellow
    }
} else {
    Write-Host "==============================================" -ForegroundColor Red
    Write-Host "Error: Repacking failed!" -ForegroundColor Red
    Write-Host "==============================================" -ForegroundColor Red
    exit 1
}
