# HawkNexa OCR — Phase 5 evidence report

**Date:** 2026-10-12  
**Deployed builds:** `6e847a0` (diagnostics), `2aad881` (container CJS runner fix)  
**Production health:** `GET /api/v1/health` → commit `2aad881`

## Phase 5A — Pre-deploy summary

| Check | Result |
|-------|--------|
| `ocr-diagnostic.spec.ts` | **5/5 pass** |
| `npm run build` | **Pass** |
| ESLint | **Skipped** (`eslint` not on PATH locally) |
| Diagnostic default off | **Yes** (`OCR_DIAGNOSTIC` unset in prod) |
| Artifact dir gitignored | **Yes** (`backend/var/ocr-diagnostic/`) |
| Test-case allowlist | **Optional** `OCR_DIAGNOSTIC_ALLOWED_TEST_IDS` |
| Secrets in logs | **Redacted** (stderr snippets capped; no env dump) |
| Committed scope | Instrumentation + docs + deploy script only (no junk fixtures) |

**Commits:** `6e847a0`, `2aad881` (+ manifest BOM fix pending push).

## Phase 5C — Running production backend

| Item | Value |
|------|--------|
| Container | `hawknexa-backend-1` (`6b31c85c7a5b`) |
| Image digest | `sha256:ab528f77ffe2…` (rebuilt on `2aad881`) |
| `BUILD_SHA` | `2aad881` |
| `OCR_ENGINE` | `auto` |
| `OCR_PIX2TEXT_MATH_CROPS` (`.env` default) | **`1`** |
| `PIX2TEXT_PYTHON` | `/opt/pix2text/bin/python` |
| `PADDLE_OCR_PYTHON` | `/opt/paddleocr/bin/python` |
| Diagnostic scripts in image | **Yes** (`ocr-pipeline-diagnose.cjs`) |
| `OCR_DIAGNOSTIC` in steady state | **Unset (off)** |

## Phase 5D — Production p57 runs

Image SHA-256 (input): `7f7d9a8665ce97fc87a0e3af15a3a6c61463c17954e521b9ef04acb2f9506be0`

### Run A — `OCR_PIX2TEXT_MATH_CROPS=0`

| Field | Value |
|-------|--------|
| Correlation ID | `67286e0e-ee51-4909-8351-98a632931872` (manifest archived locally as `prod-p57-runA-manifest.json`) |
| `orient_ocr_file` | `59172c0be72d8f78d8593bceb068cce4b9064a4f18750343a41a085020133dd1` |
| `paddle_raw` / `tesseract_raw` | `a1d344d9…` / `b3355d47…` (681 / 738 chars) |
| Merged | `3ec36ac8…` (686 chars) |

### Run B — `OCR_PIX2TEXT_MATH_CROPS=1` (prod-like)

| Field | Value |
|-------|--------|
| Correlation ID | `04dea9aa-b5ee-4479-838c-4908b12c6067` (`prod-p57-runB-manifest.json`) |
| Wall time | ~179 s total |
| Pix2Text grid worker | `workerWallMs` **117659**, `loadMs` **31496**, version **1.1.7** |
| Pix2Text cell batch | `workerWallMs` **37644**, `loadMs` **12700** |
| Merged | **602** chars (≠ local stub fusion **826** chars) |

## Phase 5E — Local vs production comparison

### Run A (Pix2Text off)

**No divergence** — all compared image/text stages **match** (prod manifest vs local `a71f0416…`).

### Run B (Pix2Text on)

| Stage | Match? | Notes |
|-------|--------|-------|
| Input / `orient_ocr_file` | **Yes** | Same hashes |
| `paddle_raw` / `tesseract_raw` | **Yes** | Same hashes |
| Crop images (most) | **Mostly yes** | Two cell crop JPEG hashes differ slightly (`56_383`, `56_447`) — likely encode/jpeg metadata, not coordinates |
| Pix2Text stdout | **No** | Prod **1693** chars real JSON; local **113** chars stub |
| `finalize_merged_ocr_text` | **No** | Prod **602** vs local **826** |

**First stage affecting merged output (Run B):** **Pix2Text worker output** (local does not run full Pix2Text 1.1.7 model).

**First stage inaccurate vs ground truth (Run A, prod = local):** **`paddle_raw`** (then Tesseract); merge does not repair cells.

## Phase 5F — Ground truth (cells a, b, e, n)

| Environment | Config | Cell hits | Notes |
|-------------|--------|-----------|-------|
| Local | Pix2Text off (`a71f0416…`) | **1 / 4** | missing **b,e**; wrong **n** |
| Local | Pix2Text on stub (`aec959e6…`) | **1 / 4** | missing **e**; wrong **b,n** |
| Production | Pix2Text off (merged sha `3ec36ac8…`) | **1 / 4** | **Identical** merged text to local Run A |

Pix2Text-on **production** merged text was not re-evaluated after container recycle; Run B manifest shows fusion changed length (**602**) but prior informal runs still did not reach **4/4** reference cells.

## Phase 5G — Pix2Text runtime discrepancy

| | Local (Windows dev) | Production VPS |
|--|---------------------|----------------|
| `workerWallMs` | **~180 ms** per invoke | **~118 s** + **~38 s** (two invokes) |
| `loadMs` (Python worker) | Not reported / ~0 | **~31 s** + **~13 s** model init |
| `stdout` size | **113** chars | **~1693** chars (real batch JSON) |
| Pix2Text version | **unknown** (fast failure/stub) | **1.1.7** |
| Python | `.venv-paddle` on dev machine | `/opt/pix2text/bin/python` |

**Conclusion:** Local ~250 ms is **not** comparable inference — the worker returns minimal JSON without loading Pix2Text. Production ~92–180 s is **model load + inference** on CPU (loadMs dominates first batch).

## Phase 5H — Portal p40 image

`/tmp/p40.jpg` **not present** on VPS (2026-10-12 check). **Blocker** remains; do not treat `fractions-page40.jpg` as the portal upload.

## Phase 5I — Classification

| Question | Result |
|----------|--------|
| Prod vs local before OCR (Run A) | **Outcome 5** — match through merge; equally poor vs ground truth |
| Prod vs local with Pix2Text | **Outcome 2/3 hybrid** — engines match; **Pix2Text/fusion differ** because local worker is not equivalent |
| Portal vs backend | **Not tested** (Outcome 4 open) |

## Phase 5J — Portal E2E

**Not completed.** See `docs/ocr/DIAGNOSTIC_ARTIFACTS.md`.

## Rollback

- Redeploy previous image / `BUILD_SHA=84038f8` via normal `deploy.sh`.
- Unset `OCR_DIAGNOSTIC` (already off).
- Remove `/app/var/ocr-diagnostic/*` inside backend container if needed.

## Next engineering step

1. **Do not tune OCR in production blindly** — Run A proves Paddle/Tesseract outputs are **byte-identical** local vs VPS on the same preprocessed image; accuracy loss starts at **`paddle_raw`**.
2. Fix **local Pix2Text parity** (install `/opt/pix2text`-equivalent venv on dev) before comparing Run B manifests for fusion logic.
3. Proceed to **targeted layout/per-cell OCR** experiment (post-investigation) with ground-truth harness; optional portal E2E to close Outcome 4.
4. Recover or re-capture **portal p40** bytes before page-40 production diagnostics.
