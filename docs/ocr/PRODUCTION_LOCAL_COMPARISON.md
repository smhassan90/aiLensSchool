# Production vs local OCR diagnostic comparison (Phase 4)

**Status:** Partial — same image bytes verified locally; full production manifest pending deploy of diagnostic build.

## Test image: `p57-divide-grid`

| Property | Value |
|----------|--------|
| Path (calibration) | `backend/test-fixtures/fractions-chapter-calibration/p57-divide-grid.jpg` |
| SHA-256 | `7f7d9a8665ce97fc87a0e3af15a3a6c61463c17954e521b9ef04acb2f9506be0` |
| Dimensions | 768 × 1024 JPEG |
| Bytes | 126621 |

Ground truth: `docs/ocr/ground_truth/p57-divide-grid.json` (cells **a, b, e, n**).

## Local diagnostic run (developer machine)

| Setting | Value |
|---------|--------|
| Command | `OCR_DIAGNOSTIC=1 OCR_AI_MERGE=0 OCR_PIX2TEXT_MATH_CROPS=0 npx tsx scripts/ocr-pipeline-diagnose.ts …` |
| Correlation ID | `147b782a-c329-4f94-9329-af595744df17` |
| Manifest | `backend/var/ocr-diagnostic/147b782a-c329-4f94-9329-af595744df17/manifest.json` |

### Stage table (local)

| Stage | Result vs ground truth |
|-------|-------------------------|
| `backend_received_upload` | Hash matches calibration file |
| `orient_ocr_file` | Preprocessed (sharp); hash differs from raw upload (expected) |
| `paddle_raw` | **Poor** — garbled grid + story bleed in engine output |
| `tesseract_raw` | **Poor** — story-heavy, weak grid structure |
| `rule_merge_merged` | **Poor** — does not recover reference cells |
| `finalize_merged_ocr_text` | **1/4** cell expression hits (a only); **b, e** missing; **n** wrong |

### Ground-truth metrics (merged text)

- Character-level cell accuracy: **1 / 4** expressions match reference meaning.
- First stage where output is unusable for cell **a**: **`paddle_raw`** (already missing correct `1 2/5 ÷ 4/5` structure).
- Merge/fusion did not introduce story text that wasn't already present in engine outputs; it did not fix fraction notation.

## Local run with `OCR_PIX2TEXT_MATH_CROPS=1`

| Setting | Value |
|---------|--------|
| Correlation ID | `0ccc7e63-cd4b-4c64-949f-28bb0220a135` |
| Paddle/Tesseract vs no-Pix2Text run | **Identical** hashes (`paddle_raw` `a1d344d9…`, `tesseract_raw` `b3355d47…`) |
| `finalize_merged_ocr_text` | **826** chars (vs 686 without Pix2Text); still **1/4** cell hits |
| First divergence vs `147b782a…` | Pix2Text branch + crop artifacts; engines unchanged |

Local Pix2Text completed in under one second (stub-like stdout); VPS informal runs ~92s — compare prod manifest after deploy before trusting local Pix2Text parity.

## Production (VPS) run

| Item | Status |
|------|--------|
| Live commit (`/api/v1/health`) | **`84038f8`** (2026-10-12) |
| Same image on VPS | Present at `/opt/apps/hawknexa/repo/backend/test-fixtures/fractions-chapter-calibration/p57-divide-grid.jpg` (same SHA-256 expected) |
| `ocr-pipeline-diagnose.ts` on host | **Blocked** — `npx` not on VPS host shell |
| In-container run | **Blocked** — production image has `/app/dist` only; diagnostic TS **not** in deployed image **84038f8** |
| Prior informal container test | `live-vps-ocr-diagnose.cjs` (pre-instrumentation) showed Pix2Text ~92s, grid fusion applied, still **0/4** reference fraction signals |

### Earliest divergence (prod vs local hypothesis)

Until a production manifest exists with `OCR_DIAGNOSTIC=1`, assume **engine stage parity** when the same `orient_ocr_file` hash and `OCR_*` flags match. Prior runs suggest **Paddle/Tesseract on preprocessed buffer** fail before Pix2Text fusion can repair.

## Comparison matrix (to complete after prod manifest)

| Stage | Production | Local | Match? |
|-------|------------|-------|--------|
| Input image SHA-256 | `7f7d9a86…` (expected) | `7f7d9a86…` | **Yes** (file on VPS) |
| `orient_ocr_file` SHA-256 | TBD | see manifest | TBD |
| Paddle raw text SHA-256 | TBD | see manifest | TBD |
| Tesseract raw text SHA-256 | TBD | see manifest | TBD |
| Pix2Text raw (if enabled) | TBD | TBD | TBD |
| Final merged text | TBD | see manifest | TBD |

**First confirmed cross-environment divergence:** *Not yet measured* — deploy diagnostic build and re-run `ocr-pipeline-diagnose.ts` inside backend container (or mount repo + `tsx`).

## Page 40

| Item | Status |
|------|--------|
| Portal image | VPS `/tmp/p40.jpg` — **not** in repo (ground truth targets portal photo) |
| Local fixture run | `fractions-page40.jpg` SHA `a192d259…`, correlation `f0a3bd09-6625-4c38-b7e6-fee4688de14a`, `OCR_PIX2TEXT_MATH_CROPS=0` |
| Merged output | 153 chars; no Pix2Text branch (no divide grid) |
| Ground truth | `docs/ocr/ground_truth/p40-add-portal-upload.json` (examples not auto-scored — no cell list) |
| Prior VPS portal test | Pix2Text `solution_block` **empty**; merge unchanged |

## Portal E2E

**Not completed** — no teacher session in automation. See `docs/ocr/DIAGNOSTIC_ARTIFACTS.md` for manual procedure.

## Next engineering step (evidence-based)

1. **Deploy** instrumentation (`OCR_DIAGNOSTIC`, runners, `ocr-pipeline-diagnose.ts`) to production image.
2. Re-run **p57** with `OCR_PIX2TEXT_MATH_CROPS=1` and compare manifests via `compare-ocr-manifests.ts`.
3. If `orient_ocr_file` hashes match but Paddle/Tesseract differ → environment/model investigation.
4. If engines match and are both poor vs ground truth → **crop/layout/per-cell OCR** (not new global engine) — aligns with Phase 1 path for divide grid only.
