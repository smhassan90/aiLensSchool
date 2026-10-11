# Specialized math OCR evaluation

Generated: 2026-10-11T20:24:02Z (metrics refreshed with LaTeX-aware matching)

## Reference quality

### p39-reduce
- Only snippet-level reference (Reduce 28/40). Full worked solution REQUIRES_ANNOTATION.

### p57-divide-grid
- Exercise cells are human-curated labels for metrics; not full-page transcript.

### p43-mult-whole
- Snippet-level only.

## Headline results

| Page / region | Best production (C merge) | Pix2Text crop | pix2tex |
|---------------|---------------------------|---------------|---------|
| p57 grid cells a,b,e,n | 0/4 exact | **4/4** (`divide_grid`) | 0/4 |
| p39 worked solution | Wrong fraction soup | ÷4 → 7/10 (noisy prose) | Garbage |
| p43 `3×1/4=3/4` | (no A–D report) | Present in full-page E | Failed |

Region retry **D** on p57: higher `fracScore`, **worse** snippet CER than C — not a fidelity win.

## Environment

- Python: `3.12.7`
- Pix2Text: `1.1.7`, load ~2s, `rapidocr==3.9.1` pin required
- pix2tex: `0.1.4`, load ~0.9s

## Install and run

```powershell
cd backend/eval/specialized-math-ocr
python -m venv ..\math-ocr-eval-venv
..\math-ocr-eval-venv\Scripts\pip install -r requirements-eval.txt
..\math-ocr-eval-venv\Scripts\python.exe run_specialized_math_eval.py
```

Recompute metrics only (no models): `$env:METRICS_ONLY='1'; python run_specialized_math_eval.py`

## Hybrid (G)

Prototype script only: `prototype_hybrid_math_fusion.py`. Production fusion not implemented.

## Integration decision

**D → path to B:** Do not integrate pix2tex. Do not run Pix2Text on every page by default. Next step: optional **crop-level Pix2Text** behind a feature flag after more p57/p39 annotations and VPS sizing — see `backend/docs/SPECIALIZED_MATH_OCR_EVAL.md`.
