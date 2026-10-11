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

## Known blockers

- Page 57 divide grid: needs per-cell layout OCR (see `docs/OCR_AUDIT.md` D1).
- Pretrained English rec weights must be present before custom training is meaningful.
