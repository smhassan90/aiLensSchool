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

if (-not (Test-Path $keystoreFile) -or -not (Test-Path $keystoreProps)) {
  $pass = $env:PLAY_UPLOAD_STORE_PASSWORD
  if (-not $pass) {
    $pass = [guid]::NewGuid().ToString('N')
    Write-Warning "PLAY_UPLOAD_STORE_PASSWORD not set — creating a new upload keystore with a generated password."
  }
  New-Item -ItemType Directory -Force -Path (Split-Path $keystoreFile) | Out-Null
  $dname = "CN=Hawk Nexa Student, OU=Mobile, O=HawkNexa, L=Karachi, ST=Sindh, C=PK"
  & keytool -genkeypair -v -storetype PKCS12 -keystore $keystoreFile -alias hawknexa-upload `
    -keyalg RSA -keysize 2048 -validity 10000 -storepass $pass -keypass $pass -dname $dname
  if ($LASTEXITCODE -ne 0) {
    throw "keytool failed to create upload keystore"
  }
  @"
storeFile=hawknexa-upload.keystore
storePassword=$pass
keyAlias=hawknexa-upload
keyPassword=$pass
"@ | Set-Content -Path $keystoreProps -Encoding UTF8
  New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
  $credFile = Join-Path $releaseDir "UPLOAD_KEY_CREDENTIALS.txt"
  @"
Save these credentials securely. You need the same upload key for every Play Store update.

Keystore file: android/app/hawknexa-upload.keystore
Alias: hawknexa-upload
Store password: $pass
Key password: $pass
"@ | Set-Content -Path $credFile -Encoding UTF8
  Write-Host "Wrote $credFile — back up the keystore and passwords." -ForegroundColor Yellow
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
