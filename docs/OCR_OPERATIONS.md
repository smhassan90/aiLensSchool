# Textbook OCR — operations

## Inference (portal)

- Dual path: `backend/ocr/paddle_ocr_worker.py` + Tesseract → `merge-paddle-tesseract-ocr.ts`.
- Custom English rec: `backend/ocr/models/science-en-rec/` (gated by `model_validate.py`).
- Env: `PADDLE_OCR_REC_MODEL_DIR`, `OCR_ENGINE`, `PADDLE_OCR_PYTHON`.

## Validate checkpoint before production

```bash
cd backend/ocr
python model_validate.py models/science-en-rec
```

## Training (recognition)

1. `python ocr/training/generate_textbook_rec_samples.py`
2. Optional real crops: `ocr/training/data/real/rec_gt.txt`
3. Download `en_PP-OCRv4_rec_train` into `PaddleOCR/pretrained_models/` (required for fine-tune).
4. `python ocr/training/train_science_rec.py --epochs 6`

Training exports to `science-en-rec-candidate`, validates, then promotes to `science-en-rec` on success. Failed runs leave production unchanged.

Manual promote: `python ocr/promote_science_rec_model.py`

## Teacher corrections → training pool

Teachers use **Verify transcript** on chapter pages. API: `PATCH /lessons/chapters/:id/pages/:sourceId/verified-ocr`.

Rows land in `ocr_training_examples`. Export JSON and run:

```bash
python ocr/training/ingest_verified_corrections.py export.json
```

Automatic retraining (thresholds, BullMQ job) is not wired by default — configure when `OCR_TRAIN_MIN_NEW_EXAMPLES` and worker are added.

## Regression

```bash
cd backend
npx tsx scripts/fractions-portal-cycle.ts
npm test -- --testPathPattern=ocr
```

## Chapter calibration (teacher-upload photos)

```powershell
backend\scripts\sync-fractions-chapter-images.ps1
cd backend
npx tsx scripts/fractions-chapter-calibrate.ts
```

See `docs/FRACTIONS_CHAPTER_CALIBRATION.md` and `test-fixtures/fractions-chapter-calibration/README.md`.

## Math region retry (opt-in)

Bounded crop re-OCR on uncertain math regions runs inside `finalizeChapterPageOcrMerge` when enabled.

| Variable | Default | Meaning |
|----------|---------|---------|
| `OCR_MATH_REGION_RETRY` | off | Set `1` to enable |
| `OCR_MATH_REGION_MAX` | `6` | Max regions per page |
| `OCR_MATH_REGION_VARIANTS` | `2` | Preprocess variants per crop |
| `PADDLE_OCR_REGION_TIMEOUT_MS` | `90000` | Per-crop Paddle timeout |

Compare variants A–D: `npx tsx scripts/fractions-region-eval.ts` → `test-fixtures/fractions-chapter-calibration/region-eval-reports/`.

## Pix2Text math crops (opt-in, disabled by default)

Optional crop-level Pix2Text for exercise grids / worked solutions. **Not** full-page OCR. **pix2tex (LaTeX-OCR) is eval-only** — not used in production.

| Variable | Default | Meaning |
|----------|---------|---------|
| `OCR_PIX2TEXT_MATH_CROPS` | off | Set `1` to enable |
| `PIX2TEXT_PYTHON` | — | Isolated venv Python (see `backend/docs/PIX2TEXT_MATH_CROPS.md`) |
| `OCR_PIX2TEXT_MAX_REGIONS` | `2` | Max math crops per page |
| `OCR_PIX2TEXT_TIMEOUT_MS` | `120000` | Worker batch timeout |

Eval harness (Pix2Text + pix2tex benchmarks): `backend/eval/specialized-math-ocr/`. Fusion regression: `npx tsx scripts/fractions-pix2text-fusion-eval.ts`.

## Known blockers

- Page 57 divide grid: production merge still weak without `OCR_PIX2TEXT_MATH_CROPS=1` and a Pix2Text venv on the host.
- Pretrained English rec weights must be present before custom training is meaningful.
- p39 full worked solution lacks a verified page reference (annotation).
