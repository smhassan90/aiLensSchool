# Phase 6.8 — Candidate math recognition models

Research based on project eval venv (`backend/eval/math-ocr-eval-venv`) and upstream docs. **Not legal advice.**

| Candidate | Role | License (upstream) | Python / deps | CPU inference | Batch | Output | Phase 6.8 status |
|-----------|------|------------------|---------------|---------------|-------|--------|------------------|
| **Pix2Text 1.1.7** | Baseline (general OCR + formula) | MIT (Pix2Text); cnstd Apache-2.0 | Pinned in `specialized-math-ocr/requirements-eval.txt`; rapidocr 3.9.1 | Yes (slow cold start) | Sequential `recognize()` | Markdown/LaTeX mix | **Benchmarked** |
| **pix2tex / LaTeX-OCR 0.1.4** | Dedicated image→LaTeX | MIT (verify upstream) | Same eval venv; PyTorch CPU | Yes | One image per call | LaTeX string | **Benchmarked** |
| **UniMERNet** | Dedicated MER | Model-specific (check HuggingFace card) | Typically PyTorch + transformers; heavy weights | GPU-oriented; CPU often impractical | Varies | LaTeX | **Not installed** — skipped (no isolated CPU benchmark in this phase) |
| **PaddleOCR 2.x** | Production baseline | Apache-2.0 | `.venv-paddle` separate from eval venv | Yes | Worker per batch | Plain text | **Benchmarked on crops** (existing runner) |
| **Tesseract** | Production baseline | Apache-2.0 | Node `tesseract.js` | Yes | Worker reuse | Plain text | **Benchmarked on crops** |

### Compatibility notes

- **Do not** merge eval venv with production Paddle env (dependency conflicts documented in Phase 6.4–6.5).
- Model weights download on first cold start (Pix2Text, pix2tex); offline use requires prior cache.
- Peak memory was **not** measured reliably in this phase (Windows process RSS not instrumented).

### UniMERNet blocker

No adapter was built: installing UniMERNet would add large transformer weights and GPU expectations without evidence of CPU viability on the current VPS-class target. Re-evaluate when a deployment GPU or a documented CPU path exists.
