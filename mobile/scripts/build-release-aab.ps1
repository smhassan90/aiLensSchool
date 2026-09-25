$ErrorActionPreference = "Stop"

$mobileRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $mobileRoot "android"
$releaseDir = Join-Path $mobileRoot "release"
$keystoreProps = Join-Path $androidDir "keystore.properties"
$keystoreFile = Join-Path $androidDir "app\hawknexa-upload.keystore"

if (-not $env:ANDROID_HOME) {
  if (Test-Path "$env:LOCALAPPDATA\Android\Sdk") {
    $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
  } elseif (Test-Path "D:\dev\android-sdk") {
    $env:ANDROID_HOME = "D:\dev\android-sdk"
  }
}

if (-not (Test-Path $keystoreProps)) {
  throw "Missing $keystoreProps. Copy keystore.properties.example to android/keystore.properties and set passwords."
}

if (-not (Test-Path $keystoreFile)) {
  throw "Missing upload keystore at $keystoreFile. Generate it before building (see keystore.properties.example)."
}

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

New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
$target = Join-Path $releaseDir "hawknexa-student-release.aab"
Copy-Item -Path $aab.FullName -Destination $target -Force

Write-Host ""
Write-Host "Release AAB created:" -ForegroundColor Green
Write-Host $target
