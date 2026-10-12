# HawkNexa OCR investigation — Phases 2–4 evidence report

**Date:** 2026-10-12  
**Scope:** Instrumentation and measurement only (no OCR/merge algorithm changes in this phase).

## Summary

| Question | Answer |
|----------|--------|
| Instrumentation implemented? | Yes — `backend/src/lessons/ocr-diagnostic/` + service/runner hooks |
| Automated tests run? | `ocr-diagnostic.spec.ts` — **4/4 passed** |
| Authenticated portal E2E? | **No** — no teacher session in automation |
| Production diagnostic manifest? | **No** — prod image at last check lacks deployed diagnostic code (local changes not on `origin/main`) |
| Local vs production differ? | **Not measured** (prod manifest missing); informal VPS runs matched poor Paddle/Tesseract behavior |
| Earliest inaccuracy vs ground truth (p57)? | **`paddle_raw`** on `orient_ocr_file` (hash `59172c0b…`) |
| Upload vs OCR image (p57 local)? | **Match** at `backend_received_upload` (`7f7d9a86…`); **transform** at `orient_ocr_file` (expected prep) |

## Image hashes (authoritative test bytes)

### p57 divide grid

| Boundary | SHA-256 | Notes |
|----------|---------|--------|
| Source file | `7f7d9a8665ce97fc87a0e3af15a3a6c61463c17954e521b9ef04acb2f9506be0` | 768×1024, 126621 B |
| `orient_ocr_file` | `59172c0be72d8f78d8593bceb068cce4b9064a4f18750343a41a085020133dd1` | 1400×1867 after prep |

### Page 40 (local fixture — not portal photo)

| Boundary | SHA-256 | Notes |
|----------|---------|--------|
| `fractions-page40.jpg` | `a192d25986d4516cd83fda6f3270d28c3208401a05d3f42e1baac644e5e36b58` | 768×1024, 90453 B |
| `orient_ocr_file` | `f58c3f892411430f38393e67a402761507bf3304156bb68f901e2fc7ecc32a9d` | 1400×1867 |

**Blocker:** Original portal upload for p40 (`/tmp/p40.jpg` on VPS) is **not** in this repo; ground truth in `p40-add-portal-upload.json` targets that photo. Local diagnostic used `fractions-page40.jpg` only.

## Ground-truth accuracy (p57 cells a, b, e, n)

| Run | Correlation ID | `OCR_PIX2TEXT_MATH_CROPS` | Cell hits |
|-----|----------------|----------------------------|-----------|
| Local | `147b782a-c329-4f94-9329-af595744df17` | 0 | **1 / 4** |
| Local | `0ccc7e63-cd4b-4c64-949f-28bb0220a135` | 1 | **1 / 4** (missing **e**; wrong **b**, **n**) |

Paddle/Tesseract text hashes **identical** across both runs; divergence begins at **Pix2Text branch** (crops + fusion). Fusion **changed** merged text (686 → 826 chars) but did **not** reach reference cell accuracy.

Local Pix2Text worker exited **0** in ~250ms with **113** stdout chars — likely stub/minimal JSON, not full VPS inference (~92s). Treat local Pix2Text timings as **environment-dependent**.

## Page 40 local diagnostic (`OCR_PIX2TEXT_MATH_CROPS=0`)

- Correlation ID: `f0a3bd09-6625-4c38-b7e6-fee4688de14a`
- **No** `branch_pix2text_math_crops` (divide grid not detected on this layout)
- Merged output **153** chars; Paddle **249**, Tesseract **2510** (merge heavily truncated)
- Ground-truth example scoring not wired (no `cells` in JSON); manual review: worked-example fractions not reliably present in merged text

## Files to commit (instrumentation deliverables)

- `backend/src/lessons/ocr-diagnostic/**`
- `backend/scripts/ocr-pipeline-diagnose.ts`, `compare-ocr-manifests.ts`
- Hooks: `lessons.service.ts`, `paddle-ocr.runner.ts`, `pix2text-math.runner.ts`, `ocr-region-image-prep.ts`
- `backend/.gitignore` — `var/ocr-diagnostic/`
- `docs/ocr/**` (ground truth, comparison, artifacts, root-cause doc, this report)
- `backend/test-fixtures/fractions-chapter-calibration/p57-divide-grid.jpg` (if tracked)

Do **not** commit `backend/var/ocr-diagnostic/` sessions or unrelated debug fixtures.

## Access blockers

1. **Production manifest** — deploy diagnostic build; run `ocr-pipeline-diagnose.ts` in container or enable `OCR_DIAGNOSTIC=1` for a scoped test window.
2. **Portal E2E** — teacher upload per `DIAGNOSTIC_ARTIFACTS.md`.
3. **p40 portal bytes** — copy `/tmp/p40.jpg` from VPS into a controlled fixture path and fill `imageSha256` in ground truth.

## Next engineering step (evidence-supported)

1. **Merge and push** instrumentation; redeploy VPS.
2. Run **same** p57 bytes on VPS with prod flags; `compare-ocr-manifests.ts` vs local `147b782a…` / `0ccc7e63…`.
3. If `orient_ocr_file` and Paddle/Tesseract **match** but text is still poor → **layout/crop/per-cell OCR** (Phase after investigation), not another global engine.
4. If prod Paddle differs at same `orient_ocr_file` hash → model/runtime parity (custom `science-en-rec`, Python venv, container image).
5. For p40 → obtain portal image bytes; re-run with `OCR_PIX2TEXT_MATH_CROPS=1` and capture `solution_block` worker stderr in manifest.
