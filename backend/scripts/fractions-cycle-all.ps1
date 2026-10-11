# Run portal acceptance + optional train for every page in fractions_pages_manifest.json
param(
  [int]$Epochs = 6,
  [switch]$SkipTrain
)

$ErrorActionPreference = "Stop"
$Backend = Split-Path -Parent $PSScriptRoot
$Assets = "C:\Users\User\.cursor\projects\d-workspace-aiLensSchool-aiLensSchool\assets"
$Manifest = Join-Path $Backend "ocr\training\fractions_pages_manifest.json"
$LessonDir = Join-Path $Backend "test-fixtures\fractions-lesson"
New-Item -ItemType Directory -Force -Path $LessonDir | Out-Null

$env:PADDLE_OCR_PYTHON = Join-Path $Backend ".venv-paddle\Scripts\python.exe"
$env:OCR_ENGINE = "auto"
Set-Location $Backend

$pages = Get-Content $Manifest -Raw | ConvertFrom-Json
$failed = @()

foreach ($page in $pages) {
  $id = $page.id
  $img = Join-Path $LessonDir "$id.jpg"
  $src = Join-Path $Assets $page.asset
  if (-not (Test-Path $img)) {
    if (-not (Test-Path $src)) {
      Write-Warning "Skip $id — asset missing: $($page.asset)"
      continue
    }
    Copy-Item $src $img -Force
  }

  Write-Host "`n========== $id =========="
  npx --yes ts-node --transpile-only scripts/fractions-portal-cycle.ts $img --page=$id
  if ($LASTEXITCODE -eq 0) { continue }

  if ($SkipTrain) {
    $failed += $id
    continue
  }

  & $env:PADDLE_OCR_PYTHON ocr/training/ingest_fraction_manifest_labels.py --page-id $id --repeats 8
  $env:PADDLEOCR_REPO = Join-Path $Backend "PaddleOCR"
  & $env:PADDLE_OCR_PYTHON ocr/training/train_science_rec.py --epochs $Epochs --resume
  npx --yes ts-node --transpile-only scripts/fractions-portal-cycle.ts $img --page=$id
  if ($LASTEXITCODE -ne 0) { $failed += $id }
}

if ($failed.Count) {
  Write-Host "Failed pages: $($failed -join ', ')"
  exit 1
}
Write-Host "All manifest pages passed."
exit 0
