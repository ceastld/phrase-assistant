# Stamp package.json, Cargo.toml, and tauri.conf.json to the same semver.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Version,
    [string]$RepoRoot = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}

. (Join-Path $PSScriptRoot "lib\Version.ps1")
Sync-AppVersion -Version $Version -RepoRoot $RepoRoot
Write-Host "Stamped version $Version"
