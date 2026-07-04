# One-time: generate the updater signing keypair on THIS machine and embed the
# public key into tauri.conf.json. Run again only if the key is ever lost
# (existing installs would then need a fresh manual install).

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$keyDir = Join-Path $root "src-tauri\updater-keys"
$keyPath = Join-Path $keyDir "creativehub.key"
New-Item -ItemType Directory -Force -Path $keyDir | Out-Null

Write-Host "Generating a new signing keypair..." -ForegroundColor Cyan
Push-Location $root
try {
    npx tauri signer generate -w $keyPath --password "creativehub-updates" --force
    if ($LASTEXITCODE -ne 0) { throw "Key generation failed" }

    # Embed the new public key in the app config.
    $pub = (Get-Content "$keyPath.pub" -Raw).Trim()
    $confPath = Join-Path $root "src-tauri\tauri.conf.json"
    $conf = Get-Content $confPath -Raw | ConvertFrom-Json
    $conf.plugins.updater.pubkey = $pub
    # WriteAllText writes UTF-8 WITHOUT a BOM — Set-Content -Encoding UTF8 adds a
    # BOM in Windows PowerShell, which breaks Tauri's JSON parser.
    [System.IO.File]::WriteAllText($confPath, ($conf | ConvertTo-Json -Depth 10))
    Write-Host "Public key embedded in tauri.conf.json" -ForegroundColor Green

    # Prove signing works without prompting before declaring success.
    $testFile = Join-Path $env:TEMP "creativehub-signtest.txt"
    "test" | Set-Content $testFile
    npx tauri signer sign -f $keyPath --password "creativehub-updates" $testFile
    if ($LASTEXITCODE -ne 0) { throw "Test signing failed" }
    Remove-Item "$testFile*" -ErrorAction SilentlyContinue
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Signing key is working." -ForegroundColor Green
Write-Host "IMPORTANT: back up this file somewhere safe (it is NOT in git):"
Write-Host "  $keyPath" -ForegroundColor Yellow
