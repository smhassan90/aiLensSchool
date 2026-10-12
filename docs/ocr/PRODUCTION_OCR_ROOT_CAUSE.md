# HawkNexa production OCR — root-cause investigation

**Status:** Phase 5 complete — production diagnostics deployed and compared. Evidence: `docs/ocr/PHASE_5_EVIDENCE_REPORT.md`. Production commit: **`2aad881`** (`GET /api/v1/health`).

## Phase 1 — Execution path

See prior sections in git history; summary:

Portal `compressPhotosForUpload` (1600px) → `appendChapterPhotos` → `pickBestOrientedPagePhoto` (`prepareOrientedVariant`, 0°) → parallel Paddle + Tesseract on **`orient.ocrFile`** → save same bytes → `finalizeChapterPageOcrMerge` (rule merge → optional `OCR_MATH_REGION_RETRY` → optional `OCR_PIX2TEXT_MATH_CROPS` grid/solution → optional vision/AI) → `lesson_sources.ocr_text` / `merged_ocr_text` → `mapPageSources.fetchedText`.

## Phase 2 — Instrumentation (implemented)

| Component | Location |
|-----------|----------|
| Correlation ID + AsyncLocalStorage | `backend/src/lessons/ocr-diagnostic/context.ts` |
| Feature-flag snapshot | `backend/src/lessons/ocr-diagnostic/config.ts` |
| Artifact writer + manifest | `backend/src/lessons/ocr-diagnostic/artifacts.ts`, `session.ts` |
| Ground-truth eval | `backend/src/lessons/ocr-diagnostic/evaluate-ground-truth.ts` |
| Standalone pipeline (no Nest) | `backend/src/lessons/ocr-diagnostic/standalone-chapter-page.ts` |
| Production service hook | `LessonsService.runDiagnosticChapterPageOcr` |
| Engine/worker hooks | `paddle-ocr.runner.ts`, `pix2text-math.runner.ts`, `ocr-region-image-prep.ts` |
| Finalize branch events | `finalizeChapterPageOcrMerge`, `persistChapterPageEngineOcr` |
| CLI runner | `backend/scripts/ocr-pipeline-diagnose.ts` |
| Manifest diff | `backend/scripts/compare-ocr-manifests.ts` |

Enable with **`OCR_DIAGNOSTIC=1`** only. Details: `docs/ocr/DIAGNOSTIC_ARTIFACTS.md`.

## Phase 2A — Ground truth

| Test case | Ground truth file | Image |
|-----------|-------------------|--------|
| p57 divide grid | `docs/ocr/ground_truth/p57-divide-grid.json` | SHA-256 `7f7d9a8665ce97fc87a0e3af15a3a6c61463c17954e521b9ef04acb2f9506be0` |
| Page 40 upload | `docs/ocr/ground_truth/p40-add-portal-upload.json` | Portal photo (human transcription; some steps marked uncertain) |

## Phase 3 — Evidence so far (not portal E2E)

### p57 local diagnostic

| Flags | Correlation ID | Cell hits |
|-------|----------------|-----------|
| `OCR_PIX2TEXT_MATH_CROPS=0` | `147b782a-c329-4f94-9329-af595744df17` | **1/4** |
| `OCR_PIX2TEXT_MATH_CROPS=1` | `0ccc7e63-cd4b-4c64-949f-28bb0220a135` | **1/4** (fusion lengthened text, did not fix **b/e/n**) |

- **Earliest inaccuracy vs ground truth:** raw **Paddle** (and Tesseract) on `orient_ocr_file` — merge does not restore `1 2/5 ÷ 4/5` for cell **a**.
- **Upload hash = OCR input hash** at receive; **prep changes bytes** at `orient_ocr_file` (`59172c0b…`).

### p57 prior VPS informal run (84038f8, Pix2Text on)

- Grid fusion executed; output still missing clean reference fractions; story bleed in fused preview.

### Page 40 VPS upload

- No divide grid → no grid fusion.
- Pix2Text `solution_block` returned **empty**; merged text = rule merge only (Paddle/Tesseract quality dominates).

## Phase 5 — Confirmed findings (2026-10-12)

- **Run A (`OCR_PIX2TEXT_MATH_CROPS=0`):** Production and local manifests **match** through final merge (same `paddle_raw` / `tesseract_raw` / merged SHA-256). Cell accuracy **1/4** both sides.
- **Earliest inaccurate stage vs ground truth:** **`paddle_raw`** on `orient_ocr_file` (`59172c0b…`).
- **Run B:** Paddle/Tesseract still match; **Pix2Text differs** — local ~180 ms stub vs prod Pix2Text **1.1.7** with **~31s+ load** and **~118s** wall time per grid worker batch.
- **Portal p40 bytes:** not recovered (`/tmp/p40.jpg` missing on VPS).

## Root cause (evidence-based, Run A authoritative)

**Primary failure point:** OCR **engine readings on the preprocessed full-page buffer** (`orient_ocr_file`) for the divide grid — **before** merge or Pix2Text can restore reference cell expressions. Production and local are **equally poor** at this stage when Pix2Text is off.

**Why earlier fixes didn’t change portal UX:**

- Pix2Text proved **execution**, not accuracy on wide bands.
- Per-cell grid fusion (84038f8) does not apply to **page 40** layout.
- When Pix2Text returns empty (`solution_block`) or partial cells (**l/m/n** only on p57), merge stays bad.
- Portal compresses to 1600px before server prep — same bytes chain must be verified per upload.

## Remaining limitations

- No authenticated portal upload with correlation ID yet.
- Local Pix2Text path is **not** parity with `/opt/pix2text` — Run B comparisons are engine/fusion only on prod.
- Cell matcher is conservative; expression scoring in `evaluate-ground-truth.ts`.

## Rollback

Unset `OCR_DIAGNOSTIC` (default off). No change to merge/OCR algorithms in this phase. Remove `var/ocr-diagnostic/` artifacts as needed per `DIAGNOSTIC_ARTIFACTS.md`.
