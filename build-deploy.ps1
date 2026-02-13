# ============================================================
#  Traka Log Analyzer — Deployment Build Script
#  Creates a clean, production-ready zip for distribution.
# ============================================================

$ErrorActionPreference = "Stop"

# --- Configuration ---
$ProjectRoot = $PSScriptRoot
$Version     = "3.0.0"
$BuildName   = "TrakaLogAnalyzer-v$Version"
$StageDir    = Join-Path $ProjectRoot "deploy\$BuildName"
$ZipPath     = Join-Path $ProjectRoot "deploy\$BuildName.zip"

Write-Host ""
Write-Host "  ============================================" -ForegroundColor DarkCyan
Write-Host "   Traka Log Analyzer - Deployment Builder"     -ForegroundColor White
Write-Host "   Version: $Version"                           -ForegroundColor DarkGray
Write-Host "  ============================================" -ForegroundColor DarkCyan
Write-Host ""

# --- Clean previous build ---
if (Test-Path (Join-Path $ProjectRoot "deploy")) {
    Write-Host "  [1/5] Cleaning previous build..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force (Join-Path $ProjectRoot "deploy")
} else {
    Write-Host "  [1/5] No previous build to clean." -ForegroundColor DarkGray
}

# --- Create staging directory structure ---
Write-Host "  [2/5] Creating staging directory..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path $StageDir -Force | Out-Null
New-Item -ItemType Directory -Path "$StageDir\css" -Force | Out-Null
New-Item -ItemType Directory -Path "$StageDir\js" -Force | Out-Null
New-Item -ItemType Directory -Path "$StageDir\img" -Force | Out-Null
New-Item -ItemType Directory -Path "$StageDir\docs" -Force | Out-Null

# --- Copy production files ---
Write-Host "  [3/5] Copying production files..." -ForegroundColor Yellow

# Core application files
Copy-Item "$ProjectRoot\index.html"    "$StageDir\" -Force
Copy-Item "$ProjectRoot\main.js"       "$StageDir\" -Force
Copy-Item "$ProjectRoot\preload.js"    "$StageDir\" -Force
Copy-Item "$ProjectRoot\package.json"  "$StageDir\" -Force
Copy-Item "$ProjectRoot\package-lock.json" "$StageDir\" -Force

# Stylesheets
Copy-Item "$ProjectRoot\css\styles.css"          "$StageDir\css\" -Force
Copy-Item "$ProjectRoot\css\solution-styles.css"  "$StageDir\css\" -Force

# JavaScript
Copy-Item "$ProjectRoot\js\app.js"               "$StageDir\js\" -Force
Copy-Item "$ProjectRoot\js\solution-database.js"  "$StageDir\js\" -Force
Copy-Item "$ProjectRoot\js\solution-cards.js"     "$StageDir\js\" -Force
Copy-Item "$ProjectRoot\js\pdf-exporter.js"       "$StageDir\js\" -Force

# Images
Copy-Item "$ProjectRoot\img\*" "$StageDir\img\" -Force

# Documentation (polished HTML docs only)
Copy-Item "$ProjectRoot\user-guide.html"        "$StageDir\" -Force
Copy-Item "$ProjectRoot\docs\readme.html"       "$StageDir\docs\" -Force
Copy-Item "$ProjectRoot\docs\release-notes.html" "$StageDir\docs\" -Force

# --- Install production dependencies only ---
Write-Host "  [4/5] Installing production dependencies..." -ForegroundColor Yellow
Push-Location $StageDir
try {
    npm install --omit=dev --ignore-scripts 2>&1 | Out-Null
    Write-Host "         node_modules installed (production only)." -ForegroundColor DarkGray
} catch {
    Write-Host "         WARNING: npm install failed. You may need to run 'npm install' manually." -ForegroundColor Red
    Write-Host "         Error: $_" -ForegroundColor DarkGray
} finally {
    Pop-Location
}

# --- Create zip ---
Write-Host "  [5/5] Creating deployment zip..." -ForegroundColor Yellow

if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Compress-Archive -Path $StageDir -DestinationPath $ZipPath -CompressionLevel Optimal

$ZipSize = [math]::Round((Get-Item $ZipPath).Length / 1MB, 2)

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Green
Write-Host "   BUILD COMPLETE" -ForegroundColor White
Write-Host "  ============================================" -ForegroundColor Green
Write-Host ""
Write-Host "   Zip:  $ZipPath" -ForegroundColor Cyan
Write-Host "   Size: $ZipSize MB" -ForegroundColor Cyan
Write-Host ""
Write-Host "   To deploy:" -ForegroundColor DarkGray
Write-Host "     1. Copy the zip to the target machine" -ForegroundColor DarkGray
Write-Host "     2. Extract it" -ForegroundColor DarkGray
Write-Host "     3. Open a terminal in the extracted folder" -ForegroundColor DarkGray
Write-Host "     4. Run: npm start" -ForegroundColor DarkGray
Write-Host "        (Requires Node.js and Electron installed)" -ForegroundColor DarkGray
Write-Host ""
