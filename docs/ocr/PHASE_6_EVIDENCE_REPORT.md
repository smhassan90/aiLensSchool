# Phase 6 evidence report (6.1 + 6.2)

**Status:** Experimental. **Not deployed.** Production unchanged (`2aad881`).

## 1. Verified input hash

Orient buffer SHA-256 **`59172c0be72d8f78d8593bceb068cce4b9064a4f18750343a41a085020133dd1`** — verified on Experiments A, B, C, D and layout visualization runs.

## 2. Baseline full-page OCR (Experiment A)

| Metric | Result |
|--------|--------|
| Strict accuracy (a, b, e, n) | **0 / 4** |
| Missing labels | b, e |
| Wrong labels | a, n |
| `experimentA_engineMs` | ~16342 |

Source: `backend/var/math-cell-eval/p57/report-A.json`.

## 3. Layout visualization and inspection status

| Artifact | Path |
|----------|------|
| Orient copy | `backend/var/math-cell-layout-viz/p57/orient_ocr_file.jpg` |
| Annotated new vs old equal grid | `backend/var/math-cell-layout-viz/p57/annotated-new-vs-old-equal.jpg` |
| Target crops (detected layout) | `backend/var/math-cell-layout-viz/p57/crop-{a,b,e,n}-new.jpg` |
| Metadata | `backend/var/math-cell-layout-viz/p57/layout-metadata.json` |
| Eval geometry crops | `backend/var/math-cell-eval/p57/crop-{a,b,e,n}-geom.jpg` |
| D benchmark crops | `backend/var/math-cell-eval/p57/d-crop-{a,b,e,n}-original.jpg` |

**Visual inspection:** Performed in this environment via image review of `crop-*-geom.jpg`, `d-crop-*-original.jpg`, and `crop-a-new.jpg` (annotated layout JPEGs were generated but not re-opened in this pass).

## 4. Per-cell crop quality assessment

Automated geometry (B) vs visual + label-in-OCR checks (D):

| Cell | Geometry (B) | Clipping observed | Neighbor contamination | Resolution concern | Required action |
|------|----------------|-------------------|------------------------|--------------------|-----------------|
| **a** | WARN | Top: heading fragment (“following fractions”) | **Yes:** crop includes **b** (and heading) in `crop-a-new.jpg`; D1 raw lacks reliable `a.` | Moderate grain; ~85px tall crop | **Fix row 0 y0** (below heading); **narrow to left column**; re-run B before OCR |
| **b** | PASS* | Denominator of 15/42 may be tight at bottom (viz) | **Yes:** D crop / vision shows **c, d** row, not b | Same | **Fix row/column alignment** — label b box does not match GT cell b |
| **e** | PASS* | Not fully verified | **Yes:** vision shows **i, j**; D1 raw `1\n10` | Same | **Fix row index** (off by several rows) |
| **n** | PASS* | Story text clipped | **Yes:** story prose (“ch child have?”) in D1/D2 | N/A (wrong region) | **Fix bottom row** — box lands in story band |

\*Automated PASS/WARN does not detect wrong label-to-region mapping.

## 5. Ground-truth mapping

- Ground truth: `docs/ocr/ground_truth/p57-divide-grid.json` — cells **a, b, e, n** with reference expressions.
- Page convention: **row-major 2×7** grid, labels `a`–`n` (`EXERCISE_CELL_LABELS` in `ocr-exercise-grid-cells.ts`).
- **Mapping convention in code is correct** (`exerciseCellGridPosition` test added).
- **Geometric assignment is incorrect** for b, e, n (and partially a): crops do not contain the expression for the assigned label (confirmed by vision + Experiment D raw OCR and `labelVisibleInRaw` flags).

Fixture-only calibration hook: `OCR_MATH_CELL_FIXTURE_CALIBRATION=p57-divide-grid` → `test-fixtures/fractions-chapter-calibration/p57-divide-grid-cell-calibration.json` (not created; general detector unchanged).

## 6. D1 — PaddleOCR only (four crops, no page OCR)

| Cell | Crop SHA-256 (prefix) | Size | Inference ms | Strict match | Raw output (excerpt) |
|------|------------------------|------|--------------|--------------|---------------------|
| a | `04fbfb8a…` | 564×85 | 9311 | false | `F9aractions… d.` |
| b | `e2e2fcfe…` | 397×85 | 7950 | false | `37` |
| e | `7e685597…` | 564×85 | 8392 | false | `1\n10` |
| n | `7758bdcc…` | 397×85 | 8453 | false | `ch child have?` |

- **Paddle strict accuracy: 0 / 4**
- Sequential total: **34120 ms** (~8.5 s/crop); each crop uses a **new Python worker** (no model reuse).
- Full JSON: `report-D.json` → `D1_paddleOnly`.

## 7. D2 — Tesseract only (same crop bytes, one worker)

| Cell | Inference ms | Strict match | Raw output (excerpt) |
|------|--------------|--------------|---------------------|
| a | (batch) | false | `a. = b. 15 45` (mixed cells) |
| b | | false | garbage / partial |
| e | | false | fragmented fractions |
| n | | false | `ch child have?` |

- **Tesseract strict accuracy: 0 / 4**
- Batch total: **1605 ms** (worker reused).
- Full JSON: `report-D.json` → `D2_tesseractOnly`.

## 8. D3 — Comparison

| Cell | Ground truth | Paddle exact | Tesseract exact | Paddle shows label | Tess shows label |
|------|--------------|--------------|-----------------|--------------------|------------------|
| a | 1 2/5 ÷ 4/5 | false | false | false | true (but wrong body) |
| b | 15/42 ÷ 5 | false | false | false | false |
| e | 12 3/5 ÷ 4 3/8 | false | false | false | false |
| n | 8 1/4 ÷ 3 5/8 | false | false | false | false |

**Conclusion:** With current crops, both engines fail strict match. Failure is **not** explained by fusion alone — crops often contain the wrong region or multiple labels.

## 9. Preprocessing variants (Experiment E)

**Not run** (`MATH_CELL_BENCHMARK_VARIANTS` unset). Per decision rule, OCR variant sweeps are deferred until crops are verified for b, e, n (and a column/heading fix).

## 10. Strict before / after accuracy

| Stage | Strict (a,b,e,n) |
|-------|------------------|
| Full-page A | 0/4 |
| Cell pipeline C (upscale) | 0/4 |
| D1 Paddle on geometry crops | 0/4 |
| D2 Tesseract on same crops | 0/4 |
| Pre-6.1 loose pipeline | 1/4 (invalid — `"e. 5"`) |

## 11. Timing breakdown

| Workload | Time | Bottleneck |
|----------|------|------------|
| Page OCR (A/C) | ~15–16 s | Paddle + Tesseract full page |
| Cell pipeline C | ~33 s | 4 cells × upscale × 2 engines + page OCR in script |
| Pre-6.1 | ~82 s | 4×3 variants×2 engines + page |
| D1 Paddle ×4 | ~34 s | **Repeated Paddle Python spawn + model load (~8 s/crop)** |
| D2 Tess ×4 | ~1.6 s | Single worker reuse |
| Single-cell probe (C) | ~8.5 s | Paddle ~7.9 s |

## 12. Normalization / fusion tests

Unit tests (no OCR):

- `strictCellExpressionMatches('e. 5', …)` → **false**
- `evaluateCellsStrict('e. 5', …)` → **0 hits**
- Fusion rejects counting label-only **e. 5** as GT expression (`ocr-math-cell-fusion.spec.ts`)

Fusion can still emit short wrong bodies; evaluator correctly scores them false.

## 13. Automated tests

| Suite | Result |
|-------|--------|
| `ocr-math-cell-*` | **9/9** pass |
| `ocr-diagnostic` | **5/5** pass |
| `npm run build` | **pass** |
| ESLint | Not run (executable not verified on PATH) |

Isolated benchmark: `npx tsx scripts/benchmark-math-cell-crops-p57.ts` → `report-D.json`.

## 14. Files changed (Phase 6 local tree)

**New:** `ocr-math-cell-*.ts`, `ocr-image-dimensions.ts`, `scripts/eval-math-cell-p57.ts`, `scripts/visualize-math-cell-layout-p57.ts`, `scripts/benchmark-math-cell-crops-p57.ts`, specs, `var/**` artifacts.

**Modified:** `lessons.service.ts`, `standalone-chapter-page.ts`, `evaluate-ground-truth.ts`, `ocr-exercise-grid-crop.ts` (story band guard), `ocr-exercise-grid-cells.ts` (`exerciseCellGridPosition`).

## 15. Production and flags

| Item | State |
|------|--------|
| Deployed build | `2aad881` (Phase 5 diagnostics) |
| `OCR_MATH_CELL_LAYOUT` | **0** default; not enabled in prod |
| Pix2Text | Off for these experiments |

## 16. Unresolved blockers

1. **Cell boundary / label alignment** — equal-fallback rows do not align with printed a–n rows; automated geometry PASS is insufficient.
2. **Column split / row 0 origin** — cell **a** crop includes heading and neighbor **b** in visual check.
3. **Cell n** — crop captures story prose, not expression `8 1/4 ÷ 3 5/8`.
4. **Paddle per-crop cost** — new Python process per invocation (~8 s/crop local).
5. **No 3/4 strict accuracy** — not claimed.

## 17. Recommended next experiment

1. Build **fixture-only** `p57-divide-grid-cell-calibration.json` (normalized boxes) from manual annotation or Paddle **line** anchors for `a.`–`n.` on the orient image — validate with `labelVisibleInRaw` + visual check on four targets.
2. Re-run **Experiment B** and **D**; only if crops show correct expressions, run **E** (`MATH_CELL_BENCHMARK_VARIANTS=1`) with upscale on Paddle.
3. If crops are correct but D1/D2 still 0/4, treat as **recognition-model** limitation (fraction notation) and scope training / Pix2Text parity separately.

---

## 18. Phase 6.3 — 4×4 grid + fixture calibration (2026-10-12)

**Root cause:** p57 uses a **4 column × 4 row** exercise grid (`a–d`, `e–h`, `i–l`, `m–n`), not 2×7. Row-major label order in code was correct; **column count and band origin** were wrong, so IDs were mapped to the wrong ink.

**Fixes (local, not deployed):**
- `DIVIDE_EXERCISE_GRID_COLUMNS/ROWS = 4`
- `DIVIDE_GRID_CALIBRATION_BOX` y-band adjusted (`y0≈0.098`, `y1≈0.288` on orient image)
- Fixture file: `docs/ocr/ground_truth/p57-divide-grid-cell-calibration.json` (hash + dimension gated)
- Asymmetric column edges `[0.04, 0.225, 0.405, 0.585, 0.72]` for p57 fixture writer

**Visual inspection (crops after fix):** `a` → `1 2/5 ÷`; `b` → `15/42 ÷` (minor heading bleed); `e` → `12 3/5 ÷`; `n` → `8 1/4` (slight left neighbor).

**Geometry gate:** `experimentB_geometryGatePassed: true` (`report-B.json`).

**Isolated OCR (post-gate):** Paddle **0/4**, Tesseract **0/4** strict (`report-D.json`) — now a valid recognition baseline (labels visible on some crops; engines still miss stacked fractions).

---

## 19. Phase 6.4 — upscale + math recognition on fixed crops (2026-10-12)

**Scope:** Recognition only. Calibrated crop bytes unchanged from 6.3. Ground truth unchanged. No geometry edits. No new Python packages installed.

### Verified inputs

| Check | Value |
|--------|--------|
| Orient SHA-256 | `59172c0be72d8f78d8593bceb068cce4b9064a4f18750343a41a085020133dd1` |
| Page size | 1400 × 1867 |
| Crop SHA-256 (a,b,e,n) | `0188eb19…`, `a973baac…`, `896944e4…`, `ee8182a7…` (full hashes in `report-B.json` / `report-6.4.json`) |

**Phase D baseline (pre-upscale):** Paddle 0/4, Tesseract 0/4 (`report-D.json`). Representative Paddle raw: `a.` / `` / `12` / `8\n4`.

### Ground truth vs visual (calibrated crops)

| Cell | Expected (GT) | Visual on `6.4-crop-*-original.jpg` |
|------|----------------|--------------------------------------|
| a | `1 2/5 ÷ 4/5` | Label + mixed number + ÷ + second fraction (right operand may be tight in crop) |
| b | `15/42 ÷ 5` | `b.` + stacked 15/42 + ÷; minor bleed from cell a / heading |
| e | `12 3/5 ÷ 4 3/8` | `e.` + `12` + 3/5 + ÷; divisor may extend past crop edge |
| n | `8 1/4 ÷ 3 5/8` | `n.` + `8 1/4` + ÷; slight left-edge neighbor ink |

No GT changes; cells **e** and **n** may clip trailing divisor operands — noted for interpretation, not scored loosely.

### Experiment table (strict `strictCellExpressionMatches`)

| Engine | Crop variant | Cell a | Cell b | Cell e | Cell n | Exact score | Total runtime | Model version | Valid inference? |
|--------|--------------|--------|--------|--------|--------|-------------|---------------|---------------|------------------|
| PaddleOCR | original | ✗ | ✗ | ✗ | ✗ | **0/4** | ~69 s (4 crops) | paddleocr **2.10.0** | yes |
| PaddleOCR | 2× lanczos3 | ✗ | ✗ | ✗ | ✗ | **0/4** | ~50 s | paddleocr 2.10.0 | yes |
| PaddleOCR | 3× lanczos3 | ✗ | ✗ | ✗ | ✗ | **0/4** | ~44 s | paddleocr 2.10.0 | yes |
| Tesseract | original (Phase D) | ✗ | ✗ | ✗ | ✗ | **0/4** | ~0.9 s | tesseract.js worker | yes |
| Pix2Text | original | ✗ | ✗ | ✗ | ✗ | **0/4** | ~21 s wall (~11 s load + ~9 s infer) | **1.1.7** | **yes** (math-ocr-eval-venv) |
| Fusion | paddle+tess+pix2text | ✗ | ✗ | ✗ | ✗ | **0/4** | n/a | — | — |

Full Paddle wall for all three variants: **~164 s** (12 sequential Python spawns, no model reuse). Artifact: `backend/var/math-cell-eval/p57/report-6.4.json`.

**Upscale:** Did not improve strict accuracy. 2× added fragmentary signal (`8/4`, `5\n12\ne`); 3× mis-read label on **a** (`d.`). No further scaling attempted.

### Raw outputs (selected)

**Paddle original:** a=`a.`; b=``; e=`12`; n=`8\n4`.

**Paddle 2×:** a=`a.`; b=``; e=`5\n12\ne`; n=`8/4`.

**Pix2Text 1.1.7** (`pix2text-6.4-raw.json`): LaTeX on a/e/n with partial expressions; b=`9guee 5` (MFD reported no detections on that crop). After `pix2textPlainForFusion`: a=`0 . 12/5 ÷4/5` (leading `0`, collapsed digits); e=`e . 123/5 ÷`; n=`n . 81/4 ÷` — all strict **false**.

### Pix2Text parity

| Environment | pix2text | Inference |
|-------------|----------|-----------|
| `backend/.venv-paddle` | missing | N/A (Paddle only) |
| `backend/eval/math-ocr-eval-venv` | **1.1.7** | Real ONNX/MFD load + per-crop `recognize` (~11 s cold load) |

Runner updated to prefer `eval/math-ocr-eval-venv` when `PIX2TEXT_PYTHON` unset (`pix2text-math.runner.ts`). Production path `/opt/pix2text/bin/python` not exercised locally.

### Fusion

Post-6.4 fusion (`report-6.4.json`): **0/4** strict. Paddle fragments chosen over Tesseract noise when Pix2Text absent from default experiment run; with Pix2Text wired, scores remain **0/4** (no full GT match after conservative LaTeX→plain).

### Performance

| Stage | Time | Notes |
|-------|------|--------|
| Paddle ×4 ×3 variants | ~164 s | ~8–19 s/crop spawn |
| Tesseract ×4 (D) | ~0.9 s | single worker |
| Pix2Text batch ×4 | ~21 s | one model load, ~1.8–3 s/crop |

### Tests and build (2026-10-12)

| Suite | Result |
|-------|--------|
| `ocr-math-cell-*` | **12/12** pass |
| `ocr-diagnostic` | **5/5** pass |
| `npm run build` | **pass** |
| ESLint | Not run |

Script: `npx tsx scripts/experiment-math-cell-p57-6.4.ts` (requires `PADDLE_OCR_PYTHON=backend/.venv-paddle/Scripts/python.exe`).

### Dependencies

None added in 6.4.

### Blockers

1. **Strict accuracy still 0/4** on visually valid crops for all engines tested.
2. **Paddle** does not recover stacked fractions at ~81 px crop height; upscaling does not fix.
3. **Pix2Text** infers structure on some cells but truncates operands and mis-parses mixed numbers after plain normalization; cell **b** detection failed.
4. **Worker split:** Paddle venv ≠ Pix2Text venv locally (documented; runner auto-picks eval venv for Pix2Text).

### Recommended next step

**Wire a dedicated math-crop path behind `OCR_PIX2TEXT_MATH_CROPS=1`** (already scaffolded): use Pix2Text on geometry-gated crops with **2× upscale before inference**, improve LaTeX→plain for mixed numbers (do not weaken strict scorer), and reuse **one** Pix2Text worker per page batch. Re-evaluate on p57 and a second fixture before enabling `OCR_MATH_CELL_LAYOUT`.

*Phase 6 remains uncommitted and opt-in. Production deploy remains **`2aad881`**; repo HEAD **`b982a21`** is ahead with local Phase 6 work only.*

---

## 20. Phase 6.5 — Pix2Text math-crop path + mixed-number normalization (2026-10-12)

### Code changes (local, flags off by default)

| Item | Detail |
|------|--------|
| `ocr-math-cell-pix2text.ts` | Batch Pix2Text per page when `OCR_PIX2TEXT_MATH_CROPS=1`; optional `OCR_MATH_CELL_PIX2TEXT_UPSCALE=1` (2× Lanczos) |
| `ocr-math-cell-pipeline.ts` | One Pix2Text batch per page, then fuse with Paddle/Tess candidates |
| `ocr-pix2text-latex-plain.ts` | Protect mixed numbers before digit-collapse; strip label prefix in fusion plain text |
| `evaluate-ground-truth.ts` | `scoreCellPrediction`, `exerciseLabelVisible` for per-cell reporting |
| `pix2text-math.runner.ts` | `resolvePix2TextPythonBinary()`; auto `eval/math-ocr-eval-venv` when present |
| Ground truth | `docs/ocr/ground_truth/p43-mult-whole.json` (chapter_dataset reference snippet) |

**Defaults:** `OCR_MATH_CELL_LAYOUT=0`, `OCR_PIX2TEXT_MATH_CROPS=0`, `OCR_MATH_CELL_PIX2TEXT_UPSCALE=0`.

### Baseline (unchanged artifacts)

| Source | Strict (a,b,e,n) |
|--------|------------------|
| `report-D.json` | Paddle 0/4, Tesseract 0/4 |
| `report-6.4.json` | Paddle 0/4 all variants; Pix2Text 0/4 |

Orient SHA-256 and crop hashes unchanged from §19.

### Crop boundary inspection (p57)

Artifacts: `backend/var/math-cell-eval/p57-6.5/crop-{a,b,e,n}-baseline.jpg`, `crop-{e,n}-wide-proposal.jpg`, `crop-bounds-annotated.jpg`.

| Cell | Finding |
|------|---------|
| **e** | Pix2Text returns `1 2 3/5 ÷` (no right-hand divisor); baseline crop ends at ÷ — **right operand likely clipped** |
| **n** | Pix2Text `8 1/4 ÷` only; same clipping pattern |
| **a** | Full left-hand mixed number + ÷ + first fraction visible; Pix2Text spurious leading `0 .` |
| **b** | Heading/neighbor bleed; Pix2Text MFD failure (`9guee 5`) |

Scoring used **unchanged** calibration geometry; wide crops are visual-only proposals (+12% width), not committed to calibration.

### Strict results — p57 (Pix2Text 1.1.7)

Python: `backend/eval/math-ocr-eval-venv/Scripts/python.exe`. Report: `backend/var/math-cell-eval/p57-6.5/report-6.5.json`.

| Variant | a | b | e | n | **Exact** | Wall time | Model load |
|---------|---|---|---|---|-----------|-----------|------------|
| Pix2Text original | ✗ | ✗ | ✗ | ✗ | **0/4** | ~60 s | ~51 s (cold) |
| Pix2Text 2× upscale | ✗ | ✗ | ✗ | ✗ | **0/4** | ~40 s | ~11 s (2nd batch) |
| Normalization vs raw | Same 0/4 | — | Plain improves structure (`1 2 3/5 ÷` vs `123/5`) but **no** strict wins |
| Fusion (D paddle+tess + pix2 original) | ✗ | ✗ | ✗ | ✗ | **0/4** | — | — |

Representative normalized Pix2Text plain: **a** `0 . 1 2/5 ÷4/5`; **e** `1 2 3/5 ÷`; **n** `8 1/4 ÷`.

### Second fixture — p43-mult-whole

| Field | Value |
|-------|--------|
| Image SHA-256 | `fc1380c57f20a395d463e9f3aec4eb8a53c81e83b27f5f727e8b2ea7c114dc46` |
| Region crop | `lesson_math` norm box → `p43-lesson-math-crop.jpg` |
| GT snippet | `3 × 1/4 = 3/4` |
| Strict match | **false** (full lesson paragraph OCR, not isolated equation line) |

### Runtime

- **2 subprocesses** for p57 Pix2Text (original batch + upscale batch); **1 model load per batch**.
- p43 single-crop batch: ~18 s wall (~7 s infer after load).
- Peak memory not instrumented; expect one Pix2Text ONNX stack per batch.

### Tests / build

| Suite | Result |
|-------|--------|
| `ocr-pix2text-latex-plain.spec.ts` | 5/5 |
| `ocr-math-cell-pix2text.spec.ts` | 2/2 |
| Other `ocr-math-cell-*`, `ocr-diagnostic`, `ocr-pix2text-math-fusion` | pass (see CI log) |
| `npm run build` | pass |
| ESLint | not run |

Command: `npx tsx scripts/experiment-math-cell-phase-6.5.ts`.

### Decision gate

**Recommendation: Investigate crop geometry** — widen or re-anchor **e** and **n** (and re-verify **b** bleed) with visual proof before further recognition tuning. Mixed-number normalization is validated in unit tests but did **not** produce measurable strict gains on p57 (still **0/4**). **Do not enable** `OCR_PIX2TEXT_MATH_CROPS` in production.

Production remains **`2aad881`**. No deploy.

---

## 21. Phase 6.6 — p57 crop geometry correction (2026-10-12)

**Goal:** Trustworthy crops only (no OCR tuning). Coordinate system: **orient OCR file pixels** (1400×1867). Orient SHA-256 verified: `59172c0be72d8f78d8593bceb068cce4b9064a4f18750343a41a085020133dd1`.

### Findings

| Cell | Clipping / bleed | Action |
|------|------------------|--------|
| **e** | **Confirmed** — baseline crop ended at `÷`; widened col0 **x1 305→324** | Improved; **still missing** mixed divisor `3/8` on visual check (ink extends toward col1; widening further would overlap cell **f** at same row) |
| **n** | **Confirmed** — baseline ended at `÷`; widened col1 **x1 557→576** | Improved; **still missing** `5/8` tail of divisor (same column-width limit before col2) |
| **b** | **Confirmed** — heading bleed + tight bottom | Row0 **y0 193→202**, **y1→266**, **x0 325→330**; expression `15/42 ÷ 5` now largely visible; faint top bleed may remain |

### Coordinate changes (fixture `p57-divide-grid-cell-calibration.json`)

| Parameter | 6.3 baseline | 6.6 applied |
|-----------|----------------|-------------|
| Col0 (a,e,i,m) x1 | 305 | **324** |
| Col1 (b,f,j,n) x1 | 557 | **576** |
| Row0 (a–d) y0 / y1 | 192.97 / 261.65 | **202 / 266** |
| Cell **b** x0 | 325 | **330** |

6.3 baseline preserved: `backend/var/math-cell-eval/p57-6.6/p57-divide-grid-cell-calibration-6.3-baseline.json`.

### Crop hashes (padded crop, targets a,b,e,n)

| Cell | Before (6.3) | After (6.6) |
|------|--------------|-------------|
| a | `0188eb19…` | `4628360b…` |
| b | `a973baac…` | `7d826efd…` |
| e | `896944e4…` | `3064d748…` |
| n | `ee8182a7…` | `9bc8efb1…` |

### All 14 cells

Visually audited via generated `crop-{label}-before.jpg` / `crop-{label}-after.jpg` for **a–n**. Mapping: 4×4 row-major `a–d`, `e–h`, `i–l`, `m–n` (cols 3–4 row 4 empty on page). No label swaps.

### Artifacts

`backend/var/math-cell-eval/p57-6.6/` — `report-6.6.json`, `grid-annotated-baseline-vs-proposed.jpg`, `contact-sheet-a-b-e-n.jpg`, per-cell before/after JPEGs.

Script: `npx tsx scripts/audit-p57-cell-geometry-6.6.ts`.

### Tests / build

`ocr-math-cell-fixture-calibration`, `ocr-math-cell-geometry`, `ocr-diagnostic`: **pass**. `npm run build`: **pass**. ESLint: not run.

### Unresolved

- **e** and **n** right-hand mixed divisors remain incomplete at max safe column gutter without overlapping neighbor columns (**f** / **k**).
- Next step (not started): per-cell ink-guided boxes or revised column model — **not** recognition tuning.

**Flags / production:** `OCR_MATH_CELL_LAYOUT=0`, `OCR_PIX2TEXT_MATH_CROPS=0`. Production **`2aad881`**.

---

## 22. Phase 6.7 — Ink-guided segmentation prototype (2026-10-12)

**Repository snapshot:** branch `main`, HEAD `b982a21`, production unchanged at **`2aad881`**. No commit, deploy, API, or schema changes. New flag **`OCR_MATH_CELL_INK_GUIDED`** defaults **off**.

### Workstream 1 — Evaluation dataset

Manifest: `backend/var/math-cell-eval/p57-6.7/dataset-manifest.json`.

| Fixture | Image SHA-256 (file) | Orient SHA-256 | GT | Role |
|---------|----------------------|----------------|-----|------|
| `p57-divide-grid` | `7f7d9a86…06be0` | `59172c0b…33dd1` | `p57-divide-grid.json` + cell calibration | Primary 4×4 grid; strict metrics on **a, b, e, n** (4 expressions) |
| `p43-mult-whole` | `fc1380c5…4dc46` | same | `p43-mult-whole.json` | Independent snippet only (**1** expression); **not** a divide grid — ink-guided path not applicable |

### Workstream 2 — Printed layout (p57 evidence)

Source analysis (orient pixels, greyscale ink threshold 145):

- Expressions are **wider than equal-width nominal columns**; divisors for **e** / **n** extend toward the next column.
- **e** row ink reaches **x≈324** inside the nominal col0 box; spill into col1 (**x≈325–364**) overlaps **f** on the same row — cannot widen without neighbor ink.
- **n** row ink reaches **x≈613** when empty col2–3 slots are allowed; nominal col1 box ended at **x=576**, clipping the mixed divisor tail.
- **b** row0 top trim (Phase 6.6 **y0=202**) aligns with ink; residual heading OCR noise (`CEO b.`) is recognition, not missing crop pixels.

Annotated overlay (green = Phase 6.6 nominal, red = ink-guided layout box, blue = detected ink bounds):  
`backend/var/math-cell-eval/p57-6.7/grid-ink-annotated.jpg`

### Workstream 3–5 — Implementation

- Module: `backend/src/lessons/ocr-math-cell-ink-guided.ts` — foreground ink profiles, label-anchored horizontal expansion, spill into empty row slots, neighbor-label guard, contamination fallback to nominal box.
- Integrated in `detectDivideExerciseGridLayout` when `OCR_MATH_CELL_INK_GUIDED=1` (after fixture calibration).
- Tests: `ocr-math-cell-ink-guided.spec.ts` (synthetic expansion, flag default off, contamination fallback).

### Workstream 4 — Crop comparison (A/B/C/D)

Script: `npx tsx scripts/experiment-math-cell-phase-6.7.ts`  
Optional OCR: `PHASE67_RUN_OCR=1` (Pix2Text 1.1.7, `eval/math-ocr-eval-venv`).

| Cell | A equal 6.3 | B Phase 6.6 | C ink-guided | Geometry note |
|------|-------------|-------------|--------------|----------------|
| **a** | narrow | baseline | **same as B** | Ink within nominal width |
| **b** | bleed | baseline | **same as B** | No merge with **c** |
| **e** | clipped | **best safe box** | **same as B** | Cannot pass **f** label without overlap |
| **n** | clipped | partial tail | **x1≈615** (extends into empty col2) | **Wider crop, no merge with m** |

Artifacts: `backend/var/math-cell-eval/p57-6.7/` — `crop-*-{A,B,C,D}.jpg`, `report-6.7.json`, `geometry-metadata.json`.

Geometry processing ~**1.0 s** per page (no OCR). Peak memory: **not measured**.

### Workstream 6–7 — Recognition (strict expression match, Pix2Text only)

Denominator: **4** expressions on **p57** (fixture count **1** for grid OCR).

| Crop set | Strict expression match |
|----------|-------------------------|
| B Phase 6.6 | **1/4** (a only) |
| C ink-guided | **2/4** (a, **n**) |

Per-cell: **e** still missing `4 3/8` (recognition + possible col overlap); **b** hallucination `CEO b.` on both crops. Ink-guided **n** crop recovers full `8 1/4 ÷ 3 5/8` in Pix2Text output; Paddle/Tesseract not re-run in this phase (prior phases: **0/4** on calibrated crops).

### Workstream 8 — Generalization

**p43:** documented in manifest as **non-grid**; no ink-guided divide evaluation. Outcome: **promising experiment on p57 only**, not a validated general solution.

Regression: existing `ocr-exercise-grid-p57-regression.spec.ts` and math-cell unit suites unchanged in intent; non-math pages do not enable ink-guided divide layout without heading + fixture.

### Workstream 10 — Tests / build

| Suite | Result |
|-------|--------|
| `ocr-math-cell-ink-guided.spec.ts` | pass (after sharp import fix) |
| `ocr-math-cell-layout`, `fixture-calibration`, `geometry`, `ocr-diagnostic` | pass |
| `npm run build` | pass |
| ESLint | not run |

### Acceptance vs criteria

| Criterion | Result |
|-----------|--------|
| **e** complete, no merge | **Partial** — all ink within nominal col0; tail past **x=324** overlaps **f** |
| **n** complete, no merge | **Yes** — ink-guided width **~615**; strict OCR **n** match |
| **b** heading bleed | **Same as 6.6**; no content loss |
| Coordinates / hashes | Preserved in manifest + `geometry-metadata.json` |
| Flag default off | **Yes** |
| Production | **`2aad881`** unchanged |

### Decision gate

**Recommendation: Proceed to a focused math-recognition model evaluation** — ink-guided geometry **improves n** and documents **e** overlap limits; **Pix2Text strict match remains 2/4** on the best crops. Further column widening for **e** would merge **f**. Do not enable `OCR_MATH_CELL_INK_GUIDED` in production without more fixtures and recognition work.

---

## 23. Phase 6.8 — Dedicated math recognition benchmark (2026-10-12)

**Repository:** `main` @ `b982a21`. Production **`2aad881`**. No commit, deploy, or production flag changes.

### Candidates researched

See `backend/eval/math-recog-benchmark-6.8/CANDIDATE_MODELS.md`.

| Model | Version (eval venv) | License (upstream) | Benchmarked |
|-------|---------------------|--------------------|-------------|
| Pix2Text | 1.1.7 | MIT | Yes (baseline) |
| pix2tex / LaTeX-OCR | 0.1.4 | MIT (verify) | Yes |
| PaddleOCR | 2.10.0 (`.venv-paddle`) | Apache-2.0 | Yes (crop OCR) |
| Tesseract | tesseract.js | Apache-2.0 | Yes |
| UniMERNet | — | — | **Skipped** (no CPU-isolated install in this phase) |

### Benchmark dataset

Manifest: `backend/var/math-cell-eval/phase-6.8/benchmark-manifest.json`

- **10** crop samples (5 expressions × original + 2× Lanczos): p57 **a, b, e, n** + p43 snippet.
- Crops: p57 **n** from ink-guided 6.7 (`C-ink-guided`); **a, b, e** from Phase 6.6 (`B-phase66`).
- **Category A (geometry verified):** a, b, n, p43 — **8** sample rows across scales (4 expressions).
- **Category B (geometry unresolved):** **e** only — overlap with neighbor **f**; failures not attributed solely to recognizers.

### Strict expression match (primary metric)

**p57 Category-A, original scale only** (denominator **4**: a, b, n + p43; **e** excluded):

| Model | Strict match |
|-------|----------------|
| Pix2Text 1.1.7 (Python) | **2/4** (a, n) |
| Pix2Text 2× | **1/4** (a only; n mis-label `1.`) |
| PaddleOCR | **0/4** |
| Tesseract | **0/4** |
| pix2tex | **0/4** (garbled LaTeX on textbook crops) |
| Exploratory fusion (paddle+tess+pix2text, p57 original only) | **2/4** (a, n) |

**Pix2Text baseline on same p57 cells (original, Category A): 2/3** if p43 excluded (**a**, **n** only; **b** → `CEO b.`).

Cell notes (p57, Pix2Text original):

| Cell | Category | Result |
|------|----------|--------|
| **a** | A | strict match |
| **b** | A | heading hallucination `CEO b.` |
| **e** | B | partial `12 3/5 ÷4` (missing `4 3/8`) |
| **n** | A | strict match with ink-guided crop |

**p43** snippet: Pix2Text reads full lesson paragraph; strict match on isolated equation **fails** (not a tight crop).

No separate mathematical-equivalence score (not reliably measurable without a vetted parser).

### Runtime (same machine, cold init per stack)

| Stack | Init / first load | Batch wall (10 crops) |
|-------|-------------------|------------------------|
| Paddle | ~14.9 s | ~15 s/crop amortized |
| Tesseract | ~2.4 s worker | ~10 crops sequential |
| Pix2Text Python | ~1.7 s | ~40 s total |
| pix2tex | ~0.9 s | ~39 s total |

Peak memory: **not measured**. Models were **not** loaded simultaneously.

### Artifacts

`backend/var/math-cell-eval/phase-6.8/` — `crops/`, `benchmark-manifest.json`, `candidate-comparison.json`, `raw-model-outputs.json`, `results-pix2text.json`, `results-pix2tex.json`, `dataset-expansion-proposal.md`.

**Command:**

```powershell
cd backend
$env:PADDLE_OCR_PYTHON=".\.venv-paddle\Scripts\python.exe"
npx tsx scripts/run-math-recog-benchmark-6.8.ts
```

Code: `backend/src/lessons/ocr-diagnostic/math-recog-benchmark.ts`, `backend/eval/math-recog-benchmark-6.8/benchmark_worker.py`, tests `math-recog-benchmark.spec.ts`.

### Tests / build

`math-recog-benchmark.spec.ts`: **5/5**. `npm run build`: **pass**. ESLint: not run.

### Decision gate

**Recommendation: B — Collect a larger ground-truth dataset.**

- Tested **dedicated** candidate **pix2tex** does **not** beat Pix2Text (**0/4** vs **2/4** on Category-A originals).
- **Pix2Text 1.1.7** remains the best individual recognizer on verified crops but **2/4** on the only multi-cell fixture is insufficient to justify integration of a new model.
- **e** remains a **segmentation/context** problem (Category B).
- **UniMERNet** and similar were not benchmarked; expanding the verified set is required before another heavy-model attempt.

Production remains **`2aad881`**. Experimental flags unchanged (all off by default).
