$ErrorActionPreference = "Stop"

$mobileRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $mobileRoot "android"
$releaseDir = Join-Path $mobileRoot "release"

if (-not $env:ANDROID_HOME) {
  if (Test-Path "$env:LOCALAPPDATA\Android\Sdk") {
    $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
  } elseif (Test-Path "D:\dev\android-sdk") {
    $env:ANDROID_HOME = "D:\dev\android-sdk"
  }
}

$env:NODE_ENV = "production"

Push-Location $androidDir
try {
  .\gradlew.bat assembleRelease
  if ($LASTEXITCODE -ne 0) {
    throw "Gradle assembleRelease failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

$apk = Get-ChildItem -Path (Join-Path $androidDir "app\build\outputs\apk\release") -Filter "*.apk" -Recurse |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $apk) {
  throw "Release APK was not produced."
}

New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
$target = Join-Path $releaseDir "hawknexa-parent-release.apk"
Copy-Item -Path $apk.FullName -Destination $target -Force

Write-Host ""
Write-Host "Release APK created:" -ForegroundColor Green
Write-Host $target
