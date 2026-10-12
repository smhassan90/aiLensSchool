# HawkNexa production OCR — root-cause investigation

**Status:** Phases 2–4 instrumentation complete locally; production manifest and portal E2E pending deploy. Evidence summary: `docs/ocr/PHASE_2_4_EVIDENCE_REPORT.md`. Production commit: **`84038f8`** (`GET /api/v1/health`).

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

## Phase 4 — Local vs production

See `docs/ocr/PRODUCTION_LOCAL_COMPARISON.md`. Full prod/local manifest diff **blocked** until diagnostic code is in the running container.

## Root cause (hypothesis — requires prod manifest confirmation)

**Primary failure point:** OCR **engine readings on the preprocessed full-page (or wrong region) buffer** for dense fraction grids and multi-column worked examples — **before** reliable per-cell structure exists for fusion to select.

**Why earlier fixes didn’t change portal UX:**

- Pix2Text proved **execution**, not accuracy on wide bands.
- Per-cell grid fusion (84038f8) does not apply to **page 40** layout.
- When Pix2Text returns empty (`solution_block`) or partial cells (**l/m/n** only on p57), merge stays bad.
- Portal compresses to 1600px before server prep — same bytes chain must be verified per upload.

## Remaining limitations

- No authenticated portal upload with correlation ID yet.
- Diagnostic not in production Docker image until next deploy.
- Cell matcher is conservative; expression scoring documented in `evaluate-ground-truth.ts`.

## Rollback

Unset `OCR_DIAGNOSTIC` (default off). No change to merge/OCR algorithms in this phase. Remove `var/ocr-diagnostic/` artifacts as needed per `DIAGNOSTIC_ARTIFACTS.md`.
