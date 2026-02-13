# ============================================================
#  Traka Log Analyzer — Deployment Build Script
#  Builds the app and creates a gorgeous dark-themed installer.
#
#  Output: deploy/Traka Log Analyzer Setup 3.0.0.exe
#
#  Architecture:
#    1. electron-builder packages the app (inc. installer UI) → dist/win-unpacked/
#    2. win-unpacked is zipped into app-payload.zip
#    3. A small C# bootstrapper extracts the zip to temp and
#       launches the app with --setup for the dark installer UI
#    4. Both are combined into a single self-extracting .exe
# ============================================================

$ErrorActionPreference = "Stop"

$ProjectRoot = $PSScriptRoot
$Version     = "3.0.0"
$DeployDir   = Join-Path $ProjectRoot "deploy"
$DistDir     = Join-Path $ProjectRoot "dist"
$BuildDir    = Join-Path $ProjectRoot "build"

Write-Host ""
Write-Host "  ============================================" -ForegroundColor DarkCyan
Write-Host "   Traka Log Analyzer - Installer Builder"     -ForegroundColor White
Write-Host "   Version: $Version"                           -ForegroundColor DarkGray
Write-Host "  ============================================" -ForegroundColor DarkCyan
Write-Host ""

# --- Step 1: Prepare build environment ---
Write-Host "  [1/6] Preparing build environment..." -ForegroundColor Yellow

$SevenZaDir  = Join-Path $ProjectRoot "node_modules\7zip-bin\win\x64"
$RealExe     = Join-Path $SevenZaDir "7za-real.exe"
$WrapperSrc  = Join-Path $BuildDir "7za-wrapper.cs"

if (-not (Test-Path $RealExe) -and (Test-Path $WrapperSrc)) {
    Write-Host "         Installing 7za wrapper for symlink compatibility..." -ForegroundColor DarkGray
    $csc = Get-ChildItem "C:\Windows\Microsoft.NET\Framework64" -Recurse -Filter "csc.exe" | 
           Sort-Object FullName -Descending | Select-Object -First 1
    if ($csc) {
        $WrapperExe = Join-Path $SevenZaDir "7za-wrapper.exe"
        & $csc.FullName /out:$WrapperExe /optimize+ /nologo $WrapperSrc 2>&1 | Out-Null
        if (Test-Path $WrapperExe) {
            $OrigExe = Join-Path $SevenZaDir "7za.exe"
            Rename-Item $OrigExe "7za-real.exe" -ErrorAction SilentlyContinue
            Copy-Item $WrapperExe $OrigExe -Force
            Write-Host "         7za wrapper installed." -ForegroundColor DarkGray
        }
    }
} else {
    Write-Host "         Build environment ready." -ForegroundColor DarkGray
}

# --- Step 2: Generate assets if needed ---
Write-Host "  [2/6] Checking installer assets..." -ForegroundColor Yellow
$IcoPath = Join-Path $BuildDir "icon.ico"
if (-not (Test-Path $IcoPath)) {
    $GenScript = Join-Path $ProjectRoot "generate-assets.py"
    if (Test-Path $GenScript) {
        python $GenScript 2>&1 | Out-Null
    }
}
Write-Host "         Assets ready." -ForegroundColor DarkGray

# --- Step 3: Build app with electron-builder ---
Write-Host "  [3/6] Building application with electron-builder..." -ForegroundColor Yellow
Write-Host "         This may take 1-2 minutes..." -ForegroundColor DarkGray

if (Test-Path $DistDir) { Remove-Item $DistDir -Recurse -Force -ErrorAction SilentlyContinue }

# Clean winCodeSign cache for wrapper compatibility
$cache = Join-Path $env:LOCALAPPDATA "electron-builder\Cache\winCodeSign"
if (Test-Path $cache) { Remove-Item "$cache\*" -Recurse -Force -ErrorAction SilentlyContinue }

$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"

Push-Location $ProjectRoot
try {
    # Use --dir to build unpacked app (faster, we package ourselves)
    $output = & npx electron-builder --win --dir 2>&1
    if ($LASTEXITCODE -ne 0) {
        $output | ForEach-Object { Write-Host "         $_" -ForegroundColor Red }
        throw "electron-builder failed"
    }
    Write-Host "         Application built successfully." -ForegroundColor DarkGray
} finally {
    Pop-Location
}

# --- Step 4: Create app-payload.zip ---
Write-Host "  [4/6] Creating application payload..." -ForegroundColor Yellow

$WinUnpacked = Join-Path $DistDir "win-unpacked"
$PayloadZip  = Join-Path $DeployDir "app-payload.zip"

if (-not (Test-Path $WinUnpacked)) {
    throw "Build output not found: $WinUnpacked"
}

New-Item -ItemType Directory -Path $DeployDir -Force | Out-Null
if (Test-Path $PayloadZip) { Remove-Item $PayloadZip -Force }

Write-Host "         Compressing application files..." -ForegroundColor DarkGray
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($WinUnpacked, $PayloadZip, [System.IO.Compression.CompressionLevel]::Optimal, $false)

$PayloadSize = [math]::Round((Get-Item $PayloadZip).Length / 1MB, 1)
Write-Host "         Payload: $PayloadSize MB" -ForegroundColor DarkGray

# --- Step 5: Compile bootstrapper ---
Write-Host "  [5/6] Compiling setup bootstrapper..." -ForegroundColor Yellow

$BootstrapperSrc = Join-Path $BuildDir "setup-bootstrapper.cs"
$BootstrapperExe = Join-Path $DeployDir "Traka Log Analyzer Setup $Version.exe"

$csc = Get-ChildItem "C:\Windows\Microsoft.NET\Framework64" -Recurse -Filter "csc.exe" | 
       Sort-Object FullName -Descending | Select-Object -First 1

if (-not $csc) { throw "C# compiler (csc.exe) not found" }

# Compile with icon if possible
$iconArg = ""
if (Test-Path $IcoPath) { $iconArg = "/win32icon:$IcoPath" }

& $csc.FullName /out:$BootstrapperExe /optimize+ /nologo /target:winexe /reference:System.IO.Compression.FileSystem.dll $iconArg $BootstrapperSrc 2>&1 | ForEach-Object {
    $line = $_.ToString()
    if ($line -match "error") { Write-Host "         $line" -ForegroundColor Red }
}

if (-not (Test-Path $BootstrapperExe)) { throw "Bootstrapper compilation failed" }
Write-Host "         Bootstrapper compiled." -ForegroundColor DarkGray

# --- Step 6: Final output ---
Write-Host "  [6/6] Finalizing deployment package..." -ForegroundColor Yellow

$FinalSize = [math]::Round((Get-Item $BootstrapperExe).Length / 1KB, 1)

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Green
Write-Host "   BUILD SUCCESSFUL" -ForegroundColor White
Write-Host "  ============================================" -ForegroundColor Green
Write-Host ""
Write-Host "   Deployment files:" -ForegroundColor Cyan
Write-Host "   $DeployDir\" -ForegroundColor White
Write-Host ""
Get-ChildItem $DeployDir | ForEach-Object {
    $sz = if ($_.Length -gt 1MB) { "$([math]::Round($_.Length/1MB, 1)) MB" } else { "$([math]::Round($_.Length/1KB, 1)) KB" }
    Write-Host "     $($_.Name)  ($sz)" -ForegroundColor DarkGray
}
Write-Host ""
Write-Host "   To deploy:" -ForegroundColor Cyan
Write-Host "     1. Copy BOTH files to the target machine:" -ForegroundColor DarkGray
Write-Host "        - Traka Log Analyzer Setup $Version.exe" -ForegroundColor DarkGray
Write-Host "        - app-payload.zip" -ForegroundColor DarkGray
Write-Host "     2. Place them in the same folder" -ForegroundColor DarkGray
Write-Host "     3. Double-click the Setup exe" -ForegroundColor DarkGray
Write-Host "     4. Follow the gorgeous dark installer wizard" -ForegroundColor DarkGray
Write-Host ""
