# CreativeHub release builder.
# Builds the signed NSIS installer and generates latest.json for the updater.
# Usage (from the repo root, PowerShell):
#   .\scripts\release.ps1
# Then upload the printed files to a new GitHub release.

$ErrorActionPreference = "Stop"
$repo = "Nathvandyk/CreativeFileHub"
$root = Split-Path -Parent $PSScriptRoot

# Sign with the local private key (git-ignored).
$keyPath = Join-Path $root "src-tauri\updater-keys\creativehub.key"
if (-not (Test-Path $keyPath)) {
    Write-Error "Private key not found at $keyPath. Updates cannot be signed without it."
}
# Tauri expects the key CONTENT in this variable, not a path.
$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content $keyPath -Raw).Trim()
# Fixed password baked into setup-signing.ps1. The secret is the key FILE
# (git-ignored) — the password alone is useless without it.
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "creativehub-updates"

# Read the version from tauri.conf.json (single source of truth).
$conf = Get-Content (Join-Path $root "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
$version = $conf.version
Write-Host "Building CreativeHub v$version..." -ForegroundColor Cyan

Push-Location $root
try {
    npm run tauri build
    if ($LASTEXITCODE -ne 0) { throw "tauri build failed" }
} finally {
    Pop-Location
}

$bundleDir = Join-Path $root "src-tauri\target\release\bundle\nsis"
$setup = Get-ChildItem $bundleDir -Filter "*_${version}_*-setup.exe" | Select-Object -First 1
$sig   = Get-ChildItem $bundleDir -Filter "*_${version}_*-setup.exe.sig" | Select-Object -First 1
if (-not $setup -or -not $sig) { Write-Error "Installer or signature not found in $bundleDir" }

# latest.json — what installed apps poll to discover this release.
$latest = [ordered]@{
    version  = $version
    notes    = "CreativeHub v$version"
    pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    platforms = [ordered]@{
        "windows-x86_64" = [ordered]@{
            signature = (Get-Content $sig.FullName -Raw)
            url       = "https://github.com/$repo/releases/download/v$version/$($setup.Name)"
        }
    }
}
$latestPath = Join-Path $bundleDir "latest.json"
$latest | ConvertTo-Json -Depth 4 | Set-Content $latestPath -Encoding UTF8

Write-Host ""
Write-Host "Done. Create a GitHub release tagged v$version on $repo and upload:" -ForegroundColor Green
Write-Host "  1. $($setup.FullName)"
Write-Host "  2. $latestPath"
Write-Host ""
Write-Host "Installed apps will pick it up from releases/latest/download/latest.json."
