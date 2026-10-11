# Fractions chapter — calibration report (teacher uploads)

Generated from live OCR runs against `test-fixtures/fractions-chapter-calibration/`.

## Pipeline trace (one page)

1. **Portal upload** → `PageOcrService` orientation (Tesseract-scored) → greyscale buffer.
2. **Paddle** → `ocr/paddle_ocr_worker.py` → preprocess, det/rec, column filter, optional divide band pass → JSON `{ text, lines[] }` with `--include-lines`.
3. **Tesseract** → `tesseract.worker` (eng) on same buffer.
4. **Merge** → `merge-paddle-tesseract-ocr.ts` + `science-ocr-clean.ts` / `ocr-fraction-layout.ts` → `mergedOcrText` stored on `LessonSource`.
5. **Teacher verify** → `PATCH .../verified-ocr` → `ocr_training_examples` (not instant model update).

**Custom science rec:** `model_validate` currently fails (`missing inference.pdiparams`). Worker uses **stock English Paddle rec** (`recModel: stock_en` in reports).

## Page 57 (`p57-divide-grid`) — measured failures

| Check | Result |
|-------|--------|
| Snippet "Divide the following fractions" | **Found** (snippet hit rate 1/1 for heading) |
| Exercise item `a. 1 2/5 ÷ 4/5` | **Not found** (exercise exact rate **0/4**) |
| Root cause | **Layout / detection**, not merge-only |

**Evidence (Paddle line boxes):** digits `25`, `45`, `325` detected as **horizontal neighbors** at similar `y0` (~113–120px), not as stacked num/den pairs. Labels `b.`, `c.`, `d.` appear in separate boxes from digit blobs.

**Paddle raw (excerpt):** `c. 325 -15 -/0`, `d. 84 … 35`, `÷` often missing or U+FFFD.

**Tesseract:** Often **drops the exercise grid entirely** and returns mostly story sums (column bleed / wrong crop).

**Merged:** Invents slash pairs from digit soup (`45/5, 13/10…`) — **flagged for teacher review**; not valid ground truth.

## Unit opener (`ch03-opener`)

| Snippet | Merged |
|---------|--------|
| MATH FLASH | OK |
| You have already learnt | OK |
| `3/4, 8/11, 6/4` | **Partial** — glued example digits / missing `8/11` in some runs |

Failure class: **fraction pairing** on dense inline example row + opener band OCR.

## Failure taxonomy (chapter-wide)

| Category | Typical cause | Example |
|----------|---------------|---------|
| `digit_soup_fraction` | Horizontal det on stacked fractions | p57 `25`+`45` |
| `missing_divide` | Charset / glyph | `÷` → `-` or absent |
| `column_bleed` | Global line sort / wrong column | Tess skips grid |
| `mixed_number_split` | Whole digit detached from stack | `1` + `2/5` → `12` |
| `engine_disagreement` | Paddle vs Tess | Story sums vs grid |

## Commands

```powershell
backend\scripts\sync-fractions-chapter-images.ps1
cd backend
npx tsx scripts/fractions-chapter-calibrate.ts
npx tsx scripts/fractions-chapter-calibrate.ts --page=p57-divide-grid
python ocr/training/export_chapter_calibration_labels.py
```

## Training status

**No new training run** in this calibration pass (pretrained `en_PP-OCRv4_rec_train` still required). Reference lines exported for synthetic + future real-crop fine-tune.

## Next engineering priority

1. **Per-cell OCR** on divide/multiply grids using letter labels (`a.`–`n.`) + column x-bands from `paddleLines`.
2. **Export verified teacher text** + page crops into `data/real/`.
3. Run full `fractions-chapter-calibrate.ts` batch (~18 pages, ~15 min CPU) and track metrics in CI from committed `reports/_summary.json` (optional).
