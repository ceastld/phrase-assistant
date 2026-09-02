# Cut a release: compute next version, stamp manifests, commit, tag, optionally push.
# Pushing tag vX.Y.Z triggers .github/workflows/release.yml.
[CmdletBinding()]
param(
    [ValidateSet("major", "minor", "patch", "auto")]
    [string]$Bump = "auto",
    [switch]$Push,
    [switch]$DryRun,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot
. (Join-Path $PSScriptRoot "lib\Version.ps1")

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if (-not $DryRun -and $branch -notin @("master", "main") -and -not $Force) {
    throw "Release from $branch is blocked. Checkout master/main or pass -Force."
}

$dirty = git status --porcelain
if (-not $DryRun -and $dirty -and -not $Force) {
    throw "Working tree is dirty. Commit or stash first, or pass -Force."
}

$version = Resolve-ReleaseVersion -Bump $Bump -RepoRoot $RepoRoot
$tag = "v$version"
$existing = git tag -l $tag
if ($existing) {
    throw "Tag $tag already exists"
}

Write-Host "Next version: $version  (bump=$Bump)"
if ($DryRun) {
    return
}

Sync-AppVersion -Version $version -RepoRoot $RepoRoot

$changed = git status --porcelain -- package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
if ($changed) {
    git add -- package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
    git commit -m "chore(release): $tag"
}

git tag -a $tag -m "Release $tag"
Write-Host "Created tag $tag"

if ($Push) {
    git push origin HEAD
    git push origin $tag
    Write-Host "Pushed $branch and $tag. GitHub Actions will publish the NSIS installer."
}
else {
    Write-Host "Tag is local only. Push when ready:"
    Write-Host "  git push origin HEAD && git push origin $tag"
}
