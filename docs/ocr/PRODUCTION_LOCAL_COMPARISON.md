# Production vs local OCR diagnostic comparison

**Updated:** Phase 5 (2026-10-12)  
**Production build:** `2aad881` (`GET /api/v1/health`)  
**Full report:** `docs/ocr/PHASE_5_EVIDENCE_REPORT.md`

## Test image: p57 divide grid

| Property | Value |
|----------|--------|
| Path | `backend/test-fixtures/fractions-chapter-calibration/p57-divide-grid.jpg` |
| SHA-256 | `7f7d9a8665ce97fc87a0e3af15a3a6c61463c17954e521b9ef04acb2f9506be0` |
| Ground truth | `docs/ocr/ground_truth/p57-divide-grid.json` |

## Run A — `OCR_PIX2TEXT_MATH_CROPS=0`

| Stage | Production | Local | Match |
|-------|------------|-------|-------|
| Input SHA-256 | `7f7d9a86…` | `7f7d9a86…` | **Yes** |
| `orient_ocr_file` | `59172c0b…` | `59172c0b…` | **Yes** |
| `paddle_raw` | `a1d344d9…` (681) | `a1d344d9…` (681) | **Yes** |
| `tesseract_raw` | `b3355d47…` (738) | `b3355d47…` (738) | **Yes** |
| `rule_merge_merged` | `3ec36ac8…` (686) | `3ec36ac8…` (686) | **Yes** |
| Final merged | `3ec36ac8…` (686) | `3ec36ac8…` (686) | **Yes** |
| Cell accuracy (a,b,e,n) | **1/4** | **1/4** | **Same** |

**Prod correlation ID:** `67286e0e-ee51-4909-8351-98a632931872`  
**Local correlation ID:** `a71f0416-b96a-4e5d-a166-ef9be7ae9d52`

**First divergence:** none.  
**First inaccuracy vs ground truth:** **`paddle_raw`**.

## Run B — `OCR_PIX2TEXT_MATH_CROPS=1`

| Stage | Production | Local | Match |
|-------|------------|-------|-------|
| Engines (Paddle/Tess) | same as Run A | same as Run A | **Yes** |
| Pix2Text `workerWallMs` | ~118s + ~38s | ~0.18s | **No** |
| Pix2Text `loadMs` | ~31s + ~13s | n/a (stub) | **No** |
| Pix2Text version | **1.1.7** | unknown | **No** |
| `pix2text_worker_stdout_raw` | ~1693 chars | 113 chars | **No** |
| Final merged | 602 chars | 826 chars | **No** |

**Prod correlation ID:** `04dea9aa-b5ee-4479-838c-4908b12c6067`  
**Local correlation ID:** `aec959e6-6e37-463e-8c6a-6f07d6edff39`

**First divergence affecting merge:** **Pix2Text worker output** (local dev does not load production Pix2Text stack).

Archived manifests (local copy): `backend/var/ocr-diagnostic/prod-p57-runA-manifest.json`, `prod-p57-runB-manifest.json`.

## Page 40 portal image

**Blocker:** `/tmp/p40.jpg` not on VPS. Do not compare using `fractions-page40.jpg` as portal bytes.

## Portal E2E

**Not completed.**

## Next step

Targeted **per-cell / crop OCR** on the verified preprocessed image (`orient_ocr_file` hash above); fix local Pix2Text venv parity before using Run B for fusion regression tests.
