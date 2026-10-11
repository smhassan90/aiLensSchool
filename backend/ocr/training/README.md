# Science textbook OCR training (λ, θ, π, √, ÷, …)

English PaddleOCR ships **without** Greek/math glyphs in its charset, so the
engine cannot emit `λ` / `θ` / `π` / `÷` / `√` reliably no matter how we
post-process text (e.g. `84 ÷ 4 = 21` → `844=21`).

Fix = **train the recognizer** on lines that look like your textbook pages
(cream / pale blue / green washes), including heavy ÷ / √ crops, then load
that model in the portal OCR worker.

## Do not hardcode lesson wording

`science-ocr-clean.ts` only strips junk (duplicate numbers, confidence noise).
It must **not** invent chapter sentences or swap “theeta” → “θ” for one page.

Once the recognizer learns `θ` on one trained background style, every page that
prints `θ` can emit it.

## Steps

```bash
cd backend
.\.venv-paddle\Scripts\python.exe ocr/training/generate_textbook_rec_samples.py
.\.venv-paddle\Scripts\python.exe ocr/training/train_science_rec.py --prepare-only

# Full train (needs PaddleOCR repo tools):
git clone --depth 1 https://github.com/PaddlePaddle/PaddleOCR.git
set PADDLEOCR_REPO=%CD%\PaddleOCR
# Fine-tune from English rec (required — training from scratch stays at acc 0):
# Download en_PP-OCRv4_rec_train from PaddleOCR model zoo into
#   PaddleOCR/pretrained_models/en_PP-OCRv4_rec_train/best_accuracy.pdparams
.\.venv-paddle\Scripts\python.exe ocr/training/train_science_rec.py --epochs 5
```

Fraction lesson pages (portal test → ingest manifest labels → train → re-test):

```powershell
.\scripts\fractions-train-one-page.ps1 -PageId 01-unit-opener
.\scripts\fractions-cycle-all.ps1
```

If a bad export returns no Paddle text, `paddle_ocr_worker.py` automatically
retries with stock English rec.

Optional: add **real** phone photos of your books under
`ocr/training/data/real/` (line crops + `rec_gt.txt` labels). Mix them into
train lists so the model sees the same ink and paper as portal uploads.

## Runtime

`paddle_ocr_worker.py` auto-loads `ocr/models/science-en-rec/` when inference
files + `science_charset.txt` are present, or when
`PADDLE_OCR_REC_MODEL_DIR` is set.

**Important:** generating samples / running a few train epochs is not enough.
Until `ocr/models/science-en-rec/inference.pdmodel` (or `.json` + `.pdiparams`)
exists, the portal still uses stock English Paddle — which **cannot emit `÷`**
reliably. After `train_science_rec.py` finishes, confirm the export step copied
inference weights into that folder, then restart the backend / OCR worker.
