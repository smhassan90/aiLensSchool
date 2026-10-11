Place fine-tuned PaddleOCR recognition inference files here:
  inference.pdmodel  (or inference.json + .pdiparams for newer exports)
  inference.pdiparams
  science_charset.txt  (copy from ocr/training/science_charset.txt)

Charset includes Greek/math ops: λ θ π √ ÷ × …

Train / export (from backend/):
  .\.venv-paddle\Scripts\python.exe ocr/training/generate_textbook_rec_samples.py
  set PADDLEOCR_REPO=%CD%\PaddleOCR
  .\.venv-paddle\Scripts\python.exe ocr/training/train_science_rec.py --epochs 25 --resume

Do not drop a low-accuracy export here — the worker auto-loads this folder and
would replace the default English recognizer.

Then set:
  PADDLE_OCR_REC_MODEL_DIR=<this directory>
or rely on auto-detect in paddle_ocr_worker.py when files exist.
