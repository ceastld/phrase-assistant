$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm is required"
}
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    throw "Rust/cargo is required"
}

npm ci
npm test
npm run tauri:build

Write-Host "Installer: src-tauri/target/release/bundle/nsis/"
