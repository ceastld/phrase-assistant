$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$here = $PSScriptRoot
. (Join-Path $here "..\lib\Version.ps1")

$failed = 0
function Assert-Eq {
    param($Actual, $Expected, [string]$Name)
    if ($Actual -ne $Expected) {
        Write-Host "FAIL $Name`n  expected: $Expected`n  actual:   $Actual"
        $script:failed++
    }
    else {
        Write-Host "ok   $Name"
    }
}

function Assert-True {
    param([bool]$Value, [string]$Name)
    Assert-Eq -Actual $Value -Expected $true -Name $Name
}

Assert-True (Test-SemVer "0.1.0") "semver 0.1.0"
Assert-True (Test-SemVer "1.2.3-beta.1") "semver prerelease"
Assert-Eq (Test-SemVer "v0.1.0") $false "reject tagged semver"
Assert-Eq (ConvertFrom-ReleaseTag "v1.4.0") "1.4.0" "strip v prefix"
Assert-Eq (Get-NextSemVer "0.1.0" "patch") "0.1.1" "patch bump"
Assert-Eq (Get-NextSemVer "0.1.9" "minor") "0.2.0" "minor bump"
Assert-Eq (Get-NextSemVer "2.3.4" "major") "3.0.0" "major bump"

$temp = Join-Path ([System.IO.Path]::GetTempPath()) ("phrase-ver-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path (Join-Path $temp "src-tauri") | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText((Join-Path $temp "package.json"), "{`n  `"name`": `"phrase-assistant`",`n  `"version`": `"0.1.0`"`n}`n", $utf8)
[System.IO.File]::WriteAllText((Join-Path $temp "src-tauri\Cargo.toml"), "[package]`nname = `"phrase-assistant`"`nversion = `"0.1.0`"`n", $utf8)
[System.IO.File]::WriteAllText((Join-Path $temp "src-tauri\tauri.conf.json"), "{`n  `"productName`": `"demo`",`n  `"version`": `"0.1.0`"`n}`n", $utf8)

Sync-AppVersion -Version "0.2.0" -RepoRoot $temp
$read = Read-AppVersion -RepoRoot $temp
Assert-Eq $read.Package "0.2.0" "package.json stamped"
Assert-Eq $read.Cargo "0.2.0" "Cargo.toml stamped"
Assert-Eq $read.Tauri "0.2.0" "tauri.conf.json stamped"

Remove-Item -Recurse -Force $temp

if ($failed -gt 0) {
    throw "$failed version script assertion(s) failed"
}
Write-Host "All version script tests passed"
