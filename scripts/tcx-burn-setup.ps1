# Siapkan file private key - buka Notepad, paste dari Phantom, simpan.
$root = Split-Path $PSScriptRoot -Parent
$secrets = Join-Path $root ".secrets"
$keyFile = Join-Path $secrets "tcx-merchant-key.json"
$example = Join-Path $PSScriptRoot "tcx-merchant-key.json.example"

New-Item -ItemType Directory -Force -Path $secrets | Out-Null

if (-not (Test-Path $keyFile)) {
  Copy-Item $example $keyFile
  Write-Host "File baru dibuat: $keyFile"
} else {
  Write-Host "File sudah ada: $keyFile"
}

Write-Host ""
Write-Host 'Notepad akan terbuka. Paste private key dari Phantom (base58 string panjang).'
Write-Host 'Bukan seed phrase 12 kata. Satu baris saja, lalu Save (Ctrl+S) dan tutup Notepad.'
Write-Host ""
notepad $keyFile

Write-Host ""
Write-Host 'Setelah simpan, jalankan:'
Write-Host '  npm run tcx:burn'
Write-Host ""
