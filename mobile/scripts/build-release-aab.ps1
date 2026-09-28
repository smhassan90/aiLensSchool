$ErrorActionPreference = "Stop"

$mobileRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $mobileRoot "android"
$releaseDir = Join-Path $mobileRoot "release"
$syncScript = Join-Path $PSScriptRoot "sync-android-signing.ps1"
$verifyKsScript = Join-Path $PSScriptRoot "verify-play-upload-keystore.ps1"
$verifyAabScript = Join-Path $PSScriptRoot "verify-aab-upload-cert.ps1"

if (-not $env:ANDROID_HOME) {
  if (Test-Path "$env:LOCALAPPDATA\Android\Sdk") {
    $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
  } elseif (Test-Path "D:\dev\android-sdk") {
    $env:ANDROID_HOME = "D:\dev\android-sdk"
  }
}

& $syncScript
& $verifyKsScript

$env:NODE_ENV = "production"
$env:NODE_OPTIONS = "--max-old-space-size=4096"
$env:CMAKE_BUILD_PARALLEL_LEVEL = "1"

Push-Location $androidDir
try {
  .\gradlew.bat :app:bundleRelease
  if ($LASTEXITCODE -ne 0) {
    throw "Gradle bundleRelease failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

$aab = Get-ChildItem -Path (Join-Path $androidDir "app\build\outputs\bundle\release") -Filter "*.aab" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $aab) {
  throw "Release AAB was not produced."
}

& $verifyAabScript -AabPath $aab.FullName

New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
$target = Join-Path $releaseDir "hawknexa-student-release.aab"
Copy-Item -Path $aab.FullName -Destination $target -Force

Write-Host ""
Write-Host "Release AAB created (Play upload cert verified):" -ForegroundColor Green
Write-Host $target
