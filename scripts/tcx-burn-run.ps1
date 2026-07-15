# Dry-run dulu, lalu konfirmasi sebelum burn on-chain.
$root = Split-Path $PSScriptRoot -Parent
$keyFile = Join-Path $root ".secrets\tcx-merchant-key.json"

if (-not (Test-Path $keyFile)) {
  Write-Host "Private key belum ada. Jalankan dulu:" -ForegroundColor Yellow
  Write-Host "  npm run tcx:burn:setup"
  exit 1
}

$raw = Get-Content $keyFile -Raw
$trimmed = $raw.Trim()
if (-not $trimmed -or $trimmed -eq '[]') {
  Write-Host "File key masih kosong []. Jalankan setup dan paste private key:" -ForegroundColor Yellow
  Write-Host "  npm run tcx:burn:setup"
  exit 1
}

Set-Location $root

Write-Host "=== Dry run (belum burn) ===" -ForegroundColor Cyan
node scripts/tcx-burn-merchant.mjs --dry-run
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
$confirm = Read-Host "Lanjut burn on-chain? (ketik y lalu Enter)"
if ($confirm -ne "y" -and $confirm -ne "Y") {
  Write-Host "Dibatalkan."
  exit 0
}

Write-Host ""
Write-Host "=== Burn ===" -ForegroundColor Cyan
node scripts/tcx-burn-merchant.mjs
exit $LASTEXITCODE
