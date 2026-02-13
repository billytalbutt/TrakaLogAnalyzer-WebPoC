# ============================================================
#  Traka Log Analyzer — Deployment Build Script
#  Builds a professional Windows installer using electron-builder.
#  Output: deploy/Traka Log Analyzer Setup X.X.X.exe
# ============================================================

$ErrorActionPreference = "Stop"

$ProjectRoot = $PSScriptRoot
$Version     = "3.0.0"
$DeployDir   = Join-Path $ProjectRoot "deploy"
$DistDir     = Join-Path $ProjectRoot "dist"

Write-Host ""
Write-Host "  ============================================" -ForegroundColor DarkCyan
Write-Host "   Traka Log Analyzer - Installer Builder"     -ForegroundColor White
Write-Host "   Version: $Version"                           -ForegroundColor DarkGray
Write-Host "  ============================================" -ForegroundColor DarkCyan
Write-Host ""

# --- Step 1: Prepare the 7za wrapper (fixes symlink issue on non-admin Windows) ---
Write-Host "  [1/5] Preparing build environment..." -ForegroundColor Yellow

$SevenZaDir  = Join-Path $ProjectRoot "node_modules\7zip-bin\win\x64"
$RealExe     = Join-Path $SevenZaDir "7za-real.exe"
$WrapperSrc  = Join-Path $ProjectRoot "build\7za-wrapper.cs"

if (-not (Test-Path $RealExe) -and (Test-Path $WrapperSrc)) {
    Write-Host "         Installing 7za wrapper for symlink compatibility..." -ForegroundColor DarkGray
    
    # Find C# compiler
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
    } else {
        Write-Host "         WARNING: C# compiler not found. Build may fail on non-admin machines." -ForegroundColor Red
    }
} else {
    Write-Host "         Build environment ready." -ForegroundColor DarkGray
}

# --- Step 2: Generate installer assets if missing ---
Write-Host "  [2/5] Checking installer assets..." -ForegroundColor Yellow

$IcoPath = Join-Path $ProjectRoot "build\icon.ico"
if (-not (Test-Path $IcoPath)) {
    Write-Host "         Generating assets with Python..." -ForegroundColor DarkGray
    $GenScript = Join-Path $ProjectRoot "generate-assets.py"
    if (Test-Path $GenScript) {
        python $GenScript 2>&1 | ForEach-Object { Write-Host "         $_" -ForegroundColor DarkGray }
    } else {
        Write-Host "         WARNING: generate-assets.py not found. Using existing assets." -ForegroundColor Red
    }
} else {
    Write-Host "         Assets present (icon.ico, sidebars)." -ForegroundColor DarkGray
}

# --- Step 3: Clean previous builds ---
Write-Host "  [3/5] Cleaning previous builds..." -ForegroundColor Yellow

if (Test-Path $DistDir) {
    Remove-Item $DistDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "         Cleaned dist/." -ForegroundColor DarkGray
}

# --- Step 4: Build the installer ---
Write-Host "  [4/5] Building Windows installer..." -ForegroundColor Yellow
Write-Host "         This may take a minute..." -ForegroundColor DarkGray

# Disable code signing auto-discovery (no certificate)
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"

# Clean winCodeSign cache to use our patched 7za
$WinCodeSignCache = Join-Path $env:LOCALAPPDATA "electron-builder\Cache\winCodeSign"
if (Test-Path $WinCodeSignCache) {
    Remove-Item "$WinCodeSignCache\*" -Recurse -Force -ErrorAction SilentlyContinue
}

# Run electron-builder
Push-Location $ProjectRoot
try {
    $buildOutput = & npm run build:win 2>&1
    $buildExitCode = $LASTEXITCODE
    
    # Show build output
    $buildOutput | ForEach-Object { 
        $line = $_.ToString()
        if ($line -match "building|downloaded|packaging") {
            Write-Host "         $line" -ForegroundColor DarkGray
        } elseif ($line -match "error|failed|ENOENT") {
            Write-Host "         $line" -ForegroundColor Red
        }
    }
    
    if ($buildExitCode -ne 0) {
        throw "electron-builder failed with exit code $buildExitCode"
    }
} finally {
    Pop-Location
}

# --- Step 5: Copy installer to deploy directory ---
Write-Host "  [5/5] Preparing deployment output..." -ForegroundColor Yellow

New-Item -ItemType Directory -Path $DeployDir -Force | Out-Null

$InstallerExe = Get-ChildItem "$DistDir\*.exe" | Where-Object { $_.Name -match "Setup" } | Select-Object -First 1

if ($InstallerExe) {
    Copy-Item $InstallerExe.FullName $DeployDir -Force
    $SizeMB = [math]::Round($InstallerExe.Length / 1MB, 1)
    
    Write-Host ""
    Write-Host "  ============================================" -ForegroundColor Green
    Write-Host "   BUILD SUCCESSFUL" -ForegroundColor White
    Write-Host "  ============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "   Installer:" -ForegroundColor Cyan
    Write-Host "   $($InstallerExe.Name)" -ForegroundColor White
    Write-Host "   Size: $SizeMB MB" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "   Output:" -ForegroundColor Cyan
    Write-Host "   $DeployDir\$($InstallerExe.Name)" -ForegroundColor White
    Write-Host ""
    Write-Host "   To deploy:" -ForegroundColor DarkGray
    Write-Host "     1. Copy the .exe to the target machine" -ForegroundColor DarkGray
    Write-Host "     2. Double-click to install" -ForegroundColor DarkGray
    Write-Host "     3. Follow the install wizard" -ForegroundColor DarkGray
    Write-Host "     4. Launch from Desktop or Start Menu" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "   No Node.js or command line needed on the" -ForegroundColor DarkGray
    Write-Host "   target machine — everything is bundled." -ForegroundColor DarkGray
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "  ============================================" -ForegroundColor Red
    Write-Host "   BUILD FAILED" -ForegroundColor White
    Write-Host "  ============================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "   No installer .exe found in dist/" -ForegroundColor Red
    Write-Host "   Check the build output above for errors." -ForegroundColor DarkGray
    Write-Host ""
    exit 1
}
