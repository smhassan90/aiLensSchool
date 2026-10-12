# OCR diagnostic artifacts (Phases 2–4)

## Enabling

Set on the **backend** process only (never enable globally for all users in production without restriction):

| Variable | Purpose |
|----------|---------|
| `OCR_DIAGNOSTIC=1` | Enables correlation-ID sessions, structured events, artifact writer |
| `OCR_DIAGNOSTIC_DIR` | Root directory (default `var/ocr-diagnostic`) |
| `OCR_DIAGNOSTIC_MAX_BYTES` | Per-session cap (default 80MB) |
| `OCR_DIAGNOSTIC_ALLOWED_TEST_IDS` | Optional comma list (e.g. `p57-divide-grid`); when set, sessions without a matching `testCaseId` are rejected |

Optional HTTP headers (when `OCR_DIAGNOSTIC=1` and portal upload is wired):

- `x-ocr-correlation-id` — must be a new UUID (do not reuse image hash or lesson id)
- `x-ocr-diagnostic-test-case` — e.g. `p57-divide-grid`

## Runner (no DB)

From `backend/`:

```bash
OCR_DIAGNOSTIC=1 npx tsx scripts/ocr-pipeline-diagnose.ts <imagePath> <testCaseId> Mathematics
```

Uses `runStandaloneDiagnosticChapterPage` (mirrors `finalizeChapterPageOcrMerge` / engine OCR without Nest DB). Production uploads can use `LessonsService.runDiagnosticChapterPageOcr` when `OCR_DIAGNOSTIC=1` — **no algorithm changes**.

Outputs:

- `OCR_DIAGNOSTIC_DIR/<correlationId>/manifest.json`
- `events.jsonl`
- Image/text stage files listed in manifest
- `run-summary.json` (includes ground-truth metrics when `docs/ocr/ground_truth/<testCaseId>.json` exists)

## Production container runner

On the VPS after deploy:

```bash
bash /opt/apps/hawknexa/repo/deploy/hawknexa/run-ocr-pipeline-diagnose-in-backend.sh \
  test-fixtures/fractions-chapter-calibration/p57-divide-grid.jpg p57-divide-grid 0
```

Set third argument to `1` for `OCR_PIX2TEXT_MATH_CROPS=1`. Copy manifests out with `docker cp` from `/app/var/ocr-diagnostic/<correlationId>/`.

## Compare manifests

```bash
npx tsx scripts/compare-ocr-manifests.ts <prodManifest.json> <localManifest.json>
```

## Retention and cleanup

- Artifacts may contain textbook page images — **do not** commit to git or expose via public URLs.
- Delete sessions older than 14 days: remove subdirectories under `OCR_DIAGNOSTIC_DIR` by mtime.
- Do not enable `OCR_DIAGNOSTIC=1` in production `.env` permanently; use for controlled test windows only.

## Portal E2E (teacher)

When no automated session is available:

1. Enable `OCR_DIAGNOSTIC=1` on backend during a maintenance window.
2. Teacher uploads **one** test image via normal chapter flow.
3. Record `x-ocr-correlation-id` if sent by a diagnostic portal build; otherwise find latest folder under `OCR_DIAGNOSTIC_DIR`.
4. Record lesson id, source id, and upload time from the portal (no credentials in logs).
