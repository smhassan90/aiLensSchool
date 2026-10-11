# Specialized mathematical OCR evaluation (fractions p39 / p57 / p43)

Evaluation date: **2026-10-11** (UTC). Production OCR path was **not** changed.

## Artifacts

| Item | Location |
|------|----------|
| Page JPEGs + `chapter_dataset.json` | `backend/test-fixtures/fractions-chapter-calibration/` |
| Portal-equivalent baselines A–D (p39, p57) | `region-eval-reports/*.json`, `e2e-portal-reports/` |
| Crop boxes (normalized) | `backend/eval/specialized-math-ocr/crop_regions.json` |
| Raw Pix2Text / pix2tex outputs | `backend/eval/specialized-math-ocr/outputs/*__pix2text.txt`, `*__pix2tex.txt` |
| Comparative JSON | `backend/eval/specialized-math-ocr/outputs/comparative_report.json` |
| Annotation gaps | `backend/eval/specialized-math-ocr/references/ANNOTATION_STATUS.md` |

## Environment (isolated)

```powershell
cd backend\eval\specialized-math-ocr
python -m venv ..\math-ocr-eval-venv
..\math-ocr-eval-venv\Scripts\pip install -r requirements-eval.txt
..\math-ocr-eval-venv\Scripts\python.exe run_specialized_math_eval.py
```

- **Pix2Text** 1.1.7 (MIT); stack includes **cnstd** (Apache-2.0), **torch**, Hugging Face weights (~hundreds of MB on first run).
- **pix2tex** (LaTeX-OCR) 0.1.4 (MIT).
- **Pin:** `rapidocr==3.9.1` — required because `rapidocr>=3.10` removed `resolve_model_key` and breaks cnstd import.
- CPU-only run on Windows; cold load ~2s (Pix2Text) + ~0.9s (pix2tex) after weights cached.

## Candidates

| ID | Description |
|----|-------------|
| A | PaddleOCR (region-eval) |
| B | Tesseract |
| C | Layout-aware merge (`OCR_AI_MERGE=0`) |
| D | C + region retry (`OCR_MATH_REGION_RETRY=1`) |
| E | Pix2Text full page + configured crops |
| F | pix2tex on math crops only |
| G | Hybrid (prose OCR + math crops) — **not implemented**; see below |

## Reference quality

- Metrics use **snippet** and **exercise-cell** references from `chapter_dataset.json` only.
- **p39** full solution is **not** verified end-to-end — only `Reduce 28/40`.
- **p57** exercise metrics use four curated cells (a, b, e, n), not the full 14× grid.
- Post-processing for metrics: LaTeX-ish normalization and collapsed spaced digits (see `run_specialized_math_eval.py`).

## Findings

### p57 — division exercise grid (primary failure mode in production)

| Candidate | Exercise cells a/b/e/n (normalized match) | Notes |
|-----------|-------------------------------------------|--------|
| A Paddle | 0/4 | Heading OK; grid is digit soup (`2166`, `5/58`) |
| B Tess | 0/4 | Labels visible; fractions garbled |
| C Merge | 0/4 | `21/21, 66/6` — wrong associations |
| D Region retry | 0/4 | Higher `fracScore`, **worse** CER vs snippet refs; duplicate story text |
| **E Pix2Text `divide_grid` crop** | **4/4** on a,b,e,n after normalization | Also reads most of c–n with plausible LaTeX; some cells wrong (e.g. **d** `84÷2/1`), **L** truncated; bleeds into “Real-life Story Sums” |
| F pix2tex crop | 0/4 | Unusable LaTeX on photo |

**Conclusion:** Pix2Text on the **grid crop** is the only candidate that recovers stacked fractions and ÷ operators for the verified cells. Production Paddle/Tesseract/merge/region-retry do not.

### p39 — reduction worked example

| Region | Pix2Text | Production C merge |
|--------|----------|-------------------|
| `worked_solution` crop | ÷4 step `28÷4 / 40÷4 = 7/10`, prose noise (`4UT`, “foctor”) | `2/4, 21/22, 2/21`, digit soup `2821427` |
| `example_fraction` crop | ÷**2** chain (likely **wrong** vs textbook ÷4 path) ending `7/10` | Same failures as full merge |

Snippet `Reduce 28/40` does not appear literally in Pix2Text output (formatted as inline math). **Full solution fidelity REQUIRES_ANNOTATION** before claiming whole-region CER.

### p43 — multiplication lesson

- Pix2Text full page: captures `3×1/4=3/4` and repeated-addition diagram math; prose OCR errors remain.
- No A–D baseline in `region-eval-reports` for this page.
- pix2tex crop: failed.

### pix2tex (LaTeX-OCR)

Designed for **single-equation** crops; on textbook photos yields nonsense LaTeX. **Not suitable** as grid or page recognizer here.

## Latency (measured, CPU, cached weights)

| Step | Typical ms (this run) |
|------|------------------------|
| Pix2Text load | ~2000 |
| pix2tex load | ~889 |
| p39 full page (E) | ~20170 |
| p39 `worked_solution` crop | ~5073 |
| p57 full page | ~13989 |
| p57 `divide_grid` crop | ~10209 |
| p43 full page | ~13676 |

**Chapter estimate (18 pages):** running Pix2Text on **every** page ≈ **4–6 minutes** CPU plus cold-start and model RAM (torch + ONNX + HF). Region-only on detected math bands (1–2 per hard page) ≈ **10–20s per page** extra — still heavy if applied chapter-wide.

Region retry D on p57 added **~125s** per region-eval run vs **~17s** engines alone (existing pipeline).

## Hybrid strategy (G) — design only

Evidence supports **math crops only**, not full-page replacement:

1. Keep Paddle + Tesseract + layout merge for body text.
2. Detect `exercise_grid` / `solution_block` (existing `ocr-math-region-detect.ts`).
3. Run **Pix2Text** (or similar) on bounded crops; convert LaTeX to plain text (collapse digits, `\frac` → `a/b`, `÷`).
4. Splice into band-aligned lines; retain raw engine + Pix2Text outputs in debug fields.
5. Mark low-confidence cells when layout bleeds (p57 crop included story heading).

**Do not** enable in production until: (1) p57 per-cell annotation covers more than four cells, (2) p39 solution reference exists, (3) fusion regression tests show net win on `fractions-chapter-e2e-portal` without story duplication.

## Integration decision

**Outcome: D — Investigate further, with a clear path to B**

- **Do not** integrate pix2tex.
- **Do not** replace the page OCR path with Pix2Text full-page (prose quality mixed; cost high).
- **Consider next:** optional **Pix2Text on detected math crops** behind a feature flag (disabled by default), after dependency pinning (`rapidocr==3.9.1`) and VPS CPU/RAM review.

Rationale: measured **exercise-cell** recovery on p57 for Pix2Text grid crop vs **0/4** for all production baselines; p39 improved in worked-solution crop but unverified end-to-end; region retry **hurts** reference CER on p57 despite higher heuristic fraction score.

## Licensing / deployment

- Pix2Text MIT; cnstd Apache-2.0; verify third-party model terms on Hugging Face before server deploy.
- pix2tex MIT.
- Separate venv mandatory — do not install into production Paddle worker env.
