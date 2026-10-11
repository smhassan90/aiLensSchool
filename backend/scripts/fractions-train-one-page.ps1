# One page: baseline portal test -> ingest labels -> regenerate synth -> train -> export -> retest
param(
  [string]$PageId = "01-unit-opener",
  [string]$ImagePath = "",
  [int]$Epochs = 8,
  [int]$MaxRounds = 2
)

$ErrorActionPreference = "Stop"
$Backend = Split-Path -Parent $PSScriptRoot
$VenvPy = Join-Path $Backend ".venv-paddle\Scripts\python.exe"
$Assets = "C:\Users\User\.cursor\projects\d-workspace-aiLensSchool-aiLensSchool\assets"
$Manifest = Join-Path $Backend "ocr\training\fractions_pages_manifest.json"
$LessonDir = Join-Path $Backend "test-fixtures\fractions-lesson"
New-Item -ItemType Directory -Force -Path $LessonDir | Out-Null

$manifest = Get-Content $Manifest -Raw | ConvertFrom-Json
$page = $manifest | Where-Object { $_.id -eq $PageId } | Select-Object -First 1
if (-not $page) { throw "Unknown page id $PageId" }

if (-not $ImagePath) {
  $ImagePath = Join-Path $LessonDir "$PageId.jpg"
  $src = Join-Path $Assets $page.asset
  if (-not (Test-Path $ImagePath)) { Copy-Item $src $ImagePath -Force }
}

$env:PADDLE_OCR_PYTHON = $VenvPy
$env:OCR_ENGINE = "auto"

Set-Location $Backend

function Run-PortalTest {
  npx --yes ts-node --transpile-only scripts/fractions-portal-cycle.ts $ImagePath --page=$PageId
  return $LASTEXITCODE
}

Write-Host "=== Baseline portal OCR: $PageId ==="
$code = Run-PortalTest
if ($code -eq 0) {
  Write-Host "PASS without retrain."
  exit 0
}

for ($round = 1; $round -le $MaxRounds; $round++) {
  Write-Host "=== Train round $round for $PageId ==="
  & $VenvPy ocr/training/generate_textbook_rec_samples.py --train 600 --val 80
  & $VenvPy ocr/training/ingest_fraction_manifest_labels.py --page-id $PageId --repeats 6

  if (-not (Test-Path (Join-Path $Backend "PaddleOCR\tools\train.py"))) {
    Write-Host "Cloning PaddleOCR (shallow)..."
    git clone --depth 1 https://github.com/PaddlePaddle/PaddleOCR.git (Join-Path $Backend "PaddleOCR")
  }
  $env:PADDLEOCR_REPO = Join-Path $Backend "PaddleOCR"
  & $VenvPy ocr/training/train_science_rec.py --epochs $Epochs --resume
  if ($LASTEXITCODE -ne 0) { throw "train failed" }

  Write-Host "=== Re-test portal OCR ==="
  $code = Run-PortalTest
  if ($code -eq 0) {
    Write-Host "PASS after round $round"
    exit 0
  }
}

Write-Host "Still failing after $MaxRounds rounds — see test-fixtures/fractions-cycle-$PageId.json"
exit 1
