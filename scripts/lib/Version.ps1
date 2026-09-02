Set-StrictMode -Version Latest

$script:SemVerPattern = '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$'

function Test-SemVer {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Version
    )
    return [bool]($Version -match $script:SemVerPattern)
}

function ConvertFrom-ReleaseTag {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Tag
    )
    if ($Tag -notmatch '^v(.+)$') {
        throw "Tag must start with v, got: $Tag"
    }
    $version = $Matches[1]
    if (-not (Test-SemVer -Version $version)) {
        throw "Tag is not semver: $Tag"
    }
    return $version
}

function Get-LatestReleaseTag {
    param(
        [string]$RepoRoot = (Get-Location).Path
    )
    Push-Location $RepoRoot
    try {
        $tags = @(git tag -l "v*.*.*" --sort=-v:refname)
        if ($tags.Count -eq 0 -or [string]::IsNullOrWhiteSpace($tags[0])) {
            return $null
        }
        return $tags[0]
    }
    finally {
        Pop-Location
    }
}

function Get-NextSemVer {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Current,
        [Parameter(Mandatory = $true)]
        [ValidateSet("major", "minor", "patch")]
        [string]$Bump
    )
    if ($Current -notmatch $script:SemVerPattern) {
        throw "Not a semver: $Current"
    }
    $major = [int]$Matches[1]
    $minor = [int]$Matches[2]
    $patch = [int]$Matches[3]
    switch ($Bump) {
        "major" { return "$($major + 1).0.0" }
        "minor" { return "$major.$($minor + 1).0" }
        default { return "$major.$minor.$($patch + 1)" }
    }
}

function Get-GitVersionMajorMinorPatch {
    param(
        [string]$RepoRoot = (Get-Location).Path
    )
    $exe = $null
    foreach ($name in @("dotnet-gitversion", "gitversion")) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd) {
            $exe = $cmd.Source
            break
        }
    }
    if (-not $exe) {
        return $null
    }

    Push-Location $RepoRoot
    try {
        $raw = & $exe /output json /nofetch 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $raw) {
            return $null
        }
        $json = $raw | Out-String | ConvertFrom-Json
        if ($json.MajorMinorPatch) {
            return [string]$json.MajorMinorPatch
        }
        return $null
    }
    catch {
        return $null
    }
    finally {
        Pop-Location
    }
}

function Resolve-ReleaseVersion {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("major", "minor", "patch", "auto")]
        [string]$Bump,
        [string]$RepoRoot = (Get-Location).Path
    )

    $latestTag = Get-LatestReleaseTag -RepoRoot $RepoRoot
    if (-not $latestTag) {
        if ($Bump -eq "auto") {
            $gv = Get-GitVersionMajorMinorPatch -RepoRoot $RepoRoot
            if ($gv -and (Test-SemVer -Version $gv)) {
                return $gv
            }
        }
        return "0.1.0"
    }

    $current = ConvertFrom-ReleaseTag -Tag $latestTag
    if ($Bump -eq "auto") {
        $gv = Get-GitVersionMajorMinorPatch -RepoRoot $RepoRoot
        if ($gv -and (Test-SemVer -Version $gv) -and $gv -ne $current) {
            return $gv
        }
        return (Get-NextSemVer -Current $current -Bump "patch")
    }
    return (Get-NextSemVer -Current $current -Bump $Bump)
}

function Sync-AppVersion {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Version,
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )
    if (-not (Test-SemVer -Version $Version)) {
        throw "Not a semver: $Version"
    }

    $packagePath = Join-Path $RepoRoot "package.json"
    $cargoPath = Join-Path $RepoRoot "src-tauri\Cargo.toml"
    $tauriPath = Join-Path $RepoRoot "src-tauri\tauri.conf.json"

    $replaceJsonVersion = {
        param([string]$Path)
        $text = Get-Content -Raw -Encoding utf8 $Path
        $updated = [regex]::Replace($text, '(?m)^(\s*"version"\s*:\s*)"[^"]+"', ('${1}"' + $Version + '"'), 1)
        if ($updated -eq $text -and $text -notmatch ('"version"\s*:\s*"' + [regex]::Escape($Version) + '"')) {
            throw "Failed to update version in $Path"
        }
        [System.IO.File]::WriteAllText($Path, $updated)
    }

    & $replaceJsonVersion $packagePath
    & $replaceJsonVersion $tauriPath

    $cargo = Get-Content -Raw -Encoding utf8 $cargoPath
    $cargoUpdated = [regex]::Replace($cargo, '(?m)^version = "[^"]+"', "version = `"$Version`"", 1)
    if ($cargoUpdated -eq $cargo -and $cargo -notmatch "(?m)^version = `"$([regex]::Escape($Version))`"") {
        throw "Failed to update src-tauri/Cargo.toml version"
    }
    [System.IO.File]::WriteAllText($cargoPath, $cargoUpdated)
}

function Read-AppVersion {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )
    $package = Get-Content -Raw -Encoding utf8 (Join-Path $RepoRoot "package.json") | ConvertFrom-Json
    $tauri = Get-Content -Raw -Encoding utf8 (Join-Path $RepoRoot "src-tauri\tauri.conf.json") | ConvertFrom-Json
    $cargo = Get-Content -Raw -Encoding utf8 (Join-Path $RepoRoot "src-tauri\Cargo.toml")
    if ($cargo -notmatch '(?m)^version = "([^"]+)"') {
        throw "Cargo.toml package version not found"
    }
    $cargoVersion = $Matches[1]
    return [pscustomobject]@{
        Package = [string]$package.version
        Tauri   = [string]$tauri.version
        Cargo   = $cargoVersion
    }
}
