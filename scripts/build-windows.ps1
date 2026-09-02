$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
. (Join-Path $PSScriptRoot "lib\Version.ps1")

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm is required"
}
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    throw "Rust/cargo is required"
}

$latestTag = Get-LatestReleaseTag
if ($latestTag) {
    $version = ConvertFrom-ReleaseTag -Tag $latestTag
    & (Join-Path $PSScriptRoot "sync-version.ps1") -Version $version
}

npm ci
npm test
npm run test:scripts
npm run tauri:build

Write-Host "Installer: src-tauri/target/release/bundle/nsis/"
