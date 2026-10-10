Place fine-tuned PaddleOCR recognition inference files here:
  inference.pdmodel  (or inference.json + .pdiparams for newer exports)
  inference.pdiparams
  science_charset.txt  (copy from ocr/training/science_charset.txt)

Then set:
  PADDLE_OCR_REC_MODEL_DIR=<this directory>
or rely on auto-detect in paddle_ocr_worker.py when files exist.
