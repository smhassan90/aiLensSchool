# Fractions chapter calibration dataset

Teacher-upload photos for Oxford **Fractions** unit (Ch. 3). Used for OCR evaluation and training-pool preparation — **not** embedded in production merge logic.

## Setup

```powershell
cd backend/scripts
./sync-fractions-chapter-images.ps1
```

Requires Cursor asset copies under `%USERPROFILE%\.cursor\projects\...\assets\`.

## Run calibration

```bash
cd backend
npx tsx scripts/fractions-chapter-calibrate.ts
npx tsx scripts/fractions-chapter-calibrate.ts --page=p57-divide-grid
```

Reports: `test-fixtures/fractions-chapter-calibration/reports/*.json`

## Ground truth

`chapter_dataset.json` holds **reference** snippets and exercise items (`reviewStatus: reference`). These are human-curated against the book photos for metrics only. Teacher **verified** transcripts in the portal (`verifiedOcrText`) are the authoritative training labels.

## Train / test split

Hold out entire pages by `id` (see `splitPolicy`). Do not place crops from the same `pageId` in both train and eval.
