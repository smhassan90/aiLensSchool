# Testing Phase 6 math OCR on production (HawkNexa VPS)

After deploy, Phase 6 code is **shipped** but **off by default**. Enable flags in `/opt/apps/hawknexa/deploy/.env`, then restart backend:

```bash
# Experimental math cell pipeline (divide-grid pages with fixture calibration)
OCR_MATH_CELL_LAYOUT=1
OCR_MATH_CELL_FIXTURE=p57-divide-grid
OCR_MATH_CELL_INK_GUIDED=1
OCR_PIX2TEXT_MATH_CROPS=1
OCR_MATH_CELL_PIX2TEXT_UPSCALE=1
PIX2TEXT_PYTHON=/opt/pix2text/bin/python
```

Ensure Pix2Text venv exists (`deploy/hawknexa/install-pix2text-venv.sh` on the server).

Redeploy or:

```bash
cd /opt/apps/hawknexa/deploy
docker compose -f docker-compose.prod.yml up -d --no-deps backend
```

Run diagnostic on a lesson page image:

```bash
bash deploy/hawknexa/run-ocr-pipeline-diagnose-in-backend.sh <image-path> <correlation-id> 1
```

Fixture calibration JSON is baked into the image at `test-fixtures/ocr-ground-truth/` (p57 orient SHA must match).
