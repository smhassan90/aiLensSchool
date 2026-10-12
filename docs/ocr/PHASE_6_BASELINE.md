# Phase 6 baseline (local, not deployed)

## Scope

Layout-aware per-cell OCR behind `OCR_MATH_CELL_LAYOUT=1` (default **off**). Production remains on Phase 5 build **`2aad881`**. No Phase 6 deployment in this workstream.

## Verified fixture

| Field | Value |
|--------|--------|
| Image file | `backend/test-fixtures/fractions-chapter-calibration/p57-divide-grid.jpg` |
| Upload SHA-256 | `7f7d9a8665ce97fc87a0e3af15a3a6c61463c17954e521b9ef04acb2f9506be0` |
| Orient OCR buffer SHA-256 | `59172c0be72d8f78d8593bceb068cce4b9064a4f18750343a41a085020133dd1` |
| Dimensions | **1400 × 1867** (authoritative; not variant thumb 768×1024) |
| Ground truth | `docs/ocr/ground_truth/p57-divide-grid.json` |

## Full-page baseline (Experiment A)

Pix2Text disabled. Paddle + Tesseract + existing merge/sanitize.

| Metric | Value |
|--------|--------|
| Strict cell accuracy (a, b, e, n) | **0 / 4** |
| Loose cell accuracy | **0 / 4** |
| Page engine time | ~15–16 s |
| Artifact | `backend/var/math-cell-eval/p57/report-A.json` |

Pre-6.1 pipeline eval (wrong 768×1024 crops, loose scorer): **1 / 4** loose (false positive **e** = `"e. 5"`), ~82 s pipeline — `baseline-pre-6.1-report.json`.

## Cell pipeline (Experiment C, upscale variant only)

| Metric | Value |
|--------|--------|
| Strict after cell pipeline | **0 / 4** |
| Pipeline wall time | ~33 s |
| Single-cell Paddle+Tess probe (cell a) | ~8.5 s |
| Artifact | `report-C.json` |

## Geometry-only (Experiment B)

No OCR. Equal-fallback grid inside calibrated band (geometry-only layout path).

| Cell | Geometry status |
|------|-----------------|
| a | WARN (edge ink) |
| b, e, n | PASS (automated geometry heuristics only) |

Artifact: `report-B.json`, crops `crop-*-geom.jpg`.

## Isolated crop recognition (Experiment D)

No page OCR. Same geometry-only layout as B. See `PHASE_6_EVIDENCE_REPORT.md` and `report-D.json`.

## Scoring policy

- **Primary:** `strictCellExpressionMatches` / `evaluateCellsStrict` — full normalized expression equality.
- **Secondary:** `cellExpressionMatchesLoose` — documented false-positive risk; not used for pass/fail.

## Known baseline bugs (fixed locally, not deployed)

1. Variant dimensions used for crops instead of orient buffer (6.1).
2. Story-line OCR false positive shrinking grid band (`ocr-exercise-grid-crop.ts` minimum band height guard).
3. Loose matcher counting `"e. 5"` as correct for cell e.

## Artifacts root

`backend/var/math-cell-eval/p57/`  
`backend/var/math-cell-layout-viz/p57/`
