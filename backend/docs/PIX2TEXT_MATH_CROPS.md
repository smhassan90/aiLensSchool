# Optional Pix2Text math crops (`OCR_PIX2TEXT_MATH_CROPS`)

Disabled by default. When unset or `0`, the NestJS OCR path does not spawn Pix2Text and behavior matches the pre-feature pipeline.

## Enable (test / staging only)

```powershell
$env:OCR_PIX2TEXT_MATH_CROPS = '1'
$env:PIX2TEXT_PYTHON = 'D:\path\to\backend\eval\math-ocr-eval-venv\Scripts\python.exe'
# Optional overrides:
# $env:OCR_PIX2TEXT_MAX_REGIONS = '2'
# $env:OCR_PIX2TEXT_MAX_CROP_PX = '1400'
# $env:OCR_PIX2TEXT_TIMEOUT_MS = '120000'
# $env:PIX2TEXT_MATH_WORKER = 'D:\path\to\backend\ocr\pix2text_math_worker.py'
```

Install the **isolated** venv (not production Paddle env):

```powershell
cd backend\eval\specialized-math-ocr
python -m venv ..\math-ocr-eval-venv
..\math-ocr-eval-venv\Scripts\pip install -r requirements-eval.txt
```

Pre-download Hugging Face / Pix2Text weights in that venv before serving traffic so requests do not trigger downloads.

## Behavior

- Full-page Paddle + Tesseract + layout merge unchanged.
- Raw `paddleOcrText` / `tesseractOcrText` are not overwritten.
- After optional `OCR_MATH_REGION_RETRY`, Pix2Text runs on **eligible** crops only (`exercise_grid_band`, `solution_block`) detected by `ocr-math-region-detect.ts`.
- Fusion is conservative; failures/timeouts keep the existing merged transcript.
- Prefer **not** enabling `OCR_MATH_REGION_RETRY=1` together with Pix2Text on the same pages unless evaluating both.

## Worker

`backend/ocr/pix2text_math_worker.py` accepts a batch JSON file, loads Pix2Text once, returns one JSON line on stdout.

See also `backend/docs/SPECIALIZED_MATH_OCR_EVAL.md`.
