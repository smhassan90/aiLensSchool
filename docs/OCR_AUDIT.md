# Textbook OCR — Phase 1 audit report

Date: 2026-03-11. Repository: aiLensSchool (NestJS `backend/`, React `portal/`).

## Executive summary

The portal implements a **dual-engine OCR path** (PaddleOCR + Tesseract → rule-based merge → lesson assembly) with a strong **teacher chapter workflow** but **no self-learning loop**. Custom Paddle recognition training exists **offline only**; a failed fine-tune (0% accuracy, missing English pretrained weights) once produced a model that returned **empty Paddle output**. Multi-column **divide exercises** and **stacked fractions** fail because detection groups digits horizontally, not as fraction structure.

---

## Defect register

| ID | Defect | Root cause (evidence) | Affected components | Proposed fix | Proof test |
|----|--------|----------------------|---------------------|--------------|------------|
| D1 | Page 57 style items wrong (`1 2/5 ÷ 4/5` → digit soup) | Paddle det/rec on phone photos; stacked fractions read as `25`, `45`; no per-cell layout | `paddle_ocr_worker.py`, merge TS | Layout: exercise cells by `a.`–`n.`; math crops; optional math OCR | `fractions-portal-cycle.ts` mustMatch `1 2/5`, `÷`, `4/5` |
| D2 | Custom rec empty output | Exported `science-en-rec` trained without loaded `en_PP-OCRv4_rec_train`; val acc ~0 | `train_science_rec.py`, `science-en-rec/` | Pretrained gate + export smoke test + candidate/promote | `model_validate.py` + inference smoke |
| D3 | ÷ not recognized | Stock English charset/rec; outputs `-`, `+`, U+FFFD | Paddle worker, merge | Fine-tune rec with ÷ in real+synthetic crops | CER on ÷ in held-out set |
| D4 | Math Flash `8/11` wrong | Glued digit rows + wrong tess slash pairing | `ocr-fraction-layout.ts`, merge | Better num/den pairing; don't prefer tess slash soup | `ocr-fraction-layout.spec.ts` + unit opener fixture |
| D5 | Multi-column bleed | Global y-sort reading order | `pick_main_column`, merge | Region/cell reconstruction | Reading-order test on 4-col fixture |
| D6 | No teacher OCR corrections stored | `LessonSource` stores engines + `ocrText`; edits go to chapter `manualText` only | Prisma, portal | `verifiedOcrText` + `OcrTrainingExample` + API | API test + UI save |
| D7 | No automated retrain | Training is manual Python scripts; no BullMQ worker | `ocr/training/*`, queues | Threshold-based job + candidate promotion | Integration test with dry-run |
| D8 | Merge is flat strings | Loses boxes, confidence, region type | `merge-paddle-tesseract-ocr.ts` | Structured `OcrPageResult` (phased) | Type + golden JSON fixtures |
| D9 | Urdu routed poorly if sent through English custom rec | `science-en-rec` is English-only | worker `get_engine` | Script routing; no custom rec for Urdu | Urdu sample page test |
| D10 | Pretrained download incomplete | 181MB tar failed mid-download in dev | `PaddleOCR/pretrained_models/` | Document + verify script in train | `train_science_rec.py` preflight |

---

## What works today

- Orientation sweep (Tesseract-scored) before OCR.
- Parallel Paddle + Tesseract; merge with cleanliness and MCQ heuristics.
- Digit-pairing fraction repair (no page-specific sentences in `science-ocr-clean.ts`).
- Chapter upload, progress polling, engine preview dialogs, chapter draft/compile.
- Offline synthetic training data generator + manifest ingest for fraction labels.
- Golden fixture tests under `backend/test-fixtures/ocr-examples/`.

---

## Architecture target (phased)

1. **Structured OCR JSON** (regions, cells, lines, confidence, model id).
2. **Layout**: OpenCV heuristics + lettered exercise cells (in progress in worker).
3. **Recognition**: Validated Paddle rec + Tesseract; math crops → future pix2tex/Mathpix (evaluate).
4. **Merge**: TS consumes structure; flags ambiguity for review.
5. **Feedback**: Teacher verifies per-page text → `OcrTrainingExample` → periodic train → **candidate** model → regression gate → promote.

---

## Phase status

| Phase | Status |
|-------|--------|
| 1 Audit | This document |
| 2 Checkpoint / inference gate | `backend/ocr/model_validate.py`, worker integration, train export to candidate |
| 3 Layout / math reconstruct | Partial (divide band, letter cells); needs cell OCR |
| 4 Verified training data | DB + API + teacher UI (this PR) |
| 5 Model comparison | Blocked on complete pretrained download |
| 6 Retrain automation | Schema + stubs; BullMQ worker TBD |
| 7 React review | Editable verified transcript per page |
| 8 Full regression set | Expand `ocr-examples` + fraction manifest |

---

## Non-goals (explicit)

- Hardcoding answers for Oxford page 57 or any single page in production merge code.
- Treating unverified OCR as training labels.
- Replacing Paddle entirely without benchmark evidence.
