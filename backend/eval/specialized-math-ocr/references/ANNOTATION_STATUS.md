# Fractions calibration — reference annotation status

Ground truth for evaluation lives in `backend/test-fixtures/fractions-chapter-calibration/chapter_dataset.json`.

| Page | Verified today | Gap |
|------|----------------|-----|
| **p39-reduce** | Snippet: `Reduce 28/40` | Full worked solution (÷4 chain, stacked numerators/denominators, REMEMBER sidebar) **REQUIRES_ANNOTATION** against `p39-reduce.jpg` |
| **p57-divide-grid** | Heading + exercise items **a, b, e, n** (human-curated strings) | Cells **c, d, f–m** not in dataset; full-page prose below grid uses separate references in story section (not exercise metrics) |
| **p43-mult-whole** | Snippets: title + `3 × 1/4 = 3/4` | No region-eval A–D baseline file yet; prose OCR not fully verified |

**Authoritative for production training:** teacher `verifiedOcrText` in the portal — not duplicated here.

When adding annotations, attach `reviewStatus: "reference"` and prefer per-region or per-cell entries over whole-page strings unless the full page was read against the image.
