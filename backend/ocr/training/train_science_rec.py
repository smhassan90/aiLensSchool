#!/usr/bin/env python3
"""
Fine-tune PaddleOCR English recognition so λ, θ, π, √, … are in the charset
and learned on textbook-colored synthetic (and optional real) line crops.

Prereq:
  python ocr/training/generate_textbook_rec_samples.py

This script prepares a PaddleOCR rec config and runs training when the
PaddleOCR repo tools are available (PADDLEOCR_REPO env or sibling clone).

Output inference dir (used by paddle_ocr_worker.py):
  ocr/models/science-en-rec/
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path
from textwrap import dedent

ROOT = Path(__file__).resolve().parent
BACKEND_OCR = ROOT.parent
DATA = ROOT / "data"
OUT_INFER = BACKEND_OCR / "models" / "science-en-rec"
CHARSET = ROOT / "science_charset.txt"


def find_paddleocr_repo() -> Path | None:
    env = os.environ.get("PADDLEOCR_REPO", "").strip()
    candidates = []
    if env:
        candidates.append(Path(env))
    candidates.extend(
        [
            ROOT / "PaddleOCR",
            BACKEND_OCR.parent.parent / "PaddleOCR",
            Path.home() / "PaddleOCR",
        ]
    )
    for c in candidates:
        if (c / "tools" / "train.py").is_file():
            return c
    return None


def write_config(repo: Path, epochs: int, batch: int) -> Path:
    # Paths must be absolute for train.py when cwd is the repo.
    train_list = (DATA / "train" / "rec_gt.txt").resolve()
    val_list = (DATA / "val" / "rec_gt.txt").resolve()
    train_data = (DATA / "train").resolve()
    val_data = (DATA / "val").resolve()
    charset = CHARSET.resolve()
    save_dir = (ROOT / "output" / "science_rec").resolve()
    save_dir.mkdir(parents=True, exist_ok=True)

    # Base on PP-OCRv4 en rec config shape (works with PaddleOCR 2.7+ tools).
    yml = dedent(
        f"""
        Global:
          debug: false
          use_gpu: false
          epoch_num: {epochs}
          log_smooth_window: 20
          print_batch_step: 10
          save_model_dir: {save_dir.as_posix()}
          save_epoch_step: 1
          eval_batch_step: [0, 50]
          cal_metric_during_train: true
          pretrained_model:
          checkpoints:
          save_inference_dir: {(OUT_INFER).resolve().as_posix()}
          use_visualdl: false
          infer_img:
          character_dict_path: {charset.as_posix()}
          max_text_length: 64
          infer_mode: false
          use_space_char: true
          distributed: false

        Architecture:
          model_type: rec
          algorithm: SVTR_LCNet
          Transform:
          Backbone:
            name: MobileNetV1Enhance
            scale: 0.5
            last_conv_stride: [1, 2]
            last_pool_type: avg
          Head:
            name: MultiHead
            head_list:
              - CTCHead:
                  Neck:
                    name: svtr
                    dims: 64
                    depth: 2
                    hidden_dims: 120
                    use_guide: True
                  Head:
                    fc_decay: 0.00001
              - SARHead:
                  enc_dim: 512
                  max_text_length: 64

        Loss:
          name: MultiLoss
          loss_config_list:
            - CTCLoss:
            - SARLoss:

        Optimizer:
          name: Adam
          beta1: 0.9
          beta2: 0.999
          lr:
            name: Cosine
            learning_rate: 0.0005
            warmup_epoch: 1
          regularizer:
            name: L2
            factor: 3.0e-05

        PostProcess:
          name: CTCLabelDecode

        Metric:
          name: RecMetric
          main_indicator: acc

        Train:
          dataset:
            name: SimpleDataSet
            data_dir: {train_data.as_posix()}
            ext_op_transform_idx: 1
            label_file_list:
              - {train_list.as_posix()}
            transforms:
              - DecodeImage:
                  img_mode: BGR
                  channel_first: false
              - RecAug:
              - MultiLabelEncode:
              - RecResizeImg:
                  image_shape: [3, 48, 320]
              - KeepKeys:
                  keep_keys: [image, label_ctc, label_sar, length, valid_ratio]
          loader:
            shuffle: true
            batch_size_per_card: {batch}
            drop_last: true
            num_workers: 2

        Eval:
          dataset:
            name: SimpleDataSet
            data_dir: {val_data.as_posix()}
            label_file_list:
              - {val_list.as_posix()}
            transforms:
              - DecodeImage:
                  img_mode: BGR
                  channel_first: false
              - MultiLabelEncode:
              - RecResizeImg:
                  image_shape: [3, 48, 320]
              - KeepKeys:
                  keep_keys: [image, label_ctc, label_sar, length, valid_ratio]
          loader:
            shuffle: false
            drop_last: false
            batch_size_per_card: {batch}
            num_workers: 2
        """
    ).strip() + "\n"

    cfg_path = ROOT / "output" / "science_rec_config.yml"
    cfg_path.parent.mkdir(parents=True, exist_ok=True)
    cfg_path.write_text(yml, encoding="utf-8")
    print(f"Wrote config {cfg_path}")
    return cfg_path


def export_placeholder_note() -> None:
    OUT_INFER.mkdir(parents=True, exist_ok=True)
    note = OUT_INFER / "README.txt"
    note.write_text(
        dedent(
            """
            Place fine-tuned PaddleOCR recognition inference files here:
              inference.pdmodel  (or inference.json + .pdiparams for newer exports)
              inference.pdiparams
              science_charset.txt  (copy from ocr/training/science_charset.txt)

            Then set:
              PADDLE_OCR_REC_MODEL_DIR=<this directory>
            or rely on auto-detect in paddle_ocr_worker.py when files exist.
            """
        ).strip()
        + "\n",
        encoding="utf-8",
    )
    # Always ship charset next to model dir for the worker.
    shutil.copy2(CHARSET, OUT_INFER / "science_charset.txt")
    print(f"Prepared model dir scaffold at {OUT_INFER}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--prepare-only", action="store_true")
    args = ap.parse_args()

    if not (DATA / "train" / "rec_gt.txt").is_file():
        print("No training data. Run: python ocr/training/generate_textbook_rec_samples.py", file=sys.stderr)
        sys.exit(2)

    export_placeholder_note()
    repo = find_paddleocr_repo()
    if repo is None:
        print(
            dedent(
                """
                PaddleOCR training tools not found.
                Clone once, then re-run:

                  git clone --depth 1 https://github.com/PaddlePaddle/PaddleOCR.git
                  set PADDLEOCR_REPO=%CD%\\PaddleOCR
                  python ocr/training/train_science_rec.py

                Or pass --prepare-only to only write config + model scaffold.
                """
            ).strip()
        )
        cfg = None
        # Still write a local config template for when repo appears.
        try:
            # Fake repo path unused — write config with absolute data paths only.
            cfg = write_config(ROOT, args.epochs, args.batch)
        except Exception as exc:
            print(f"Config write skipped: {exc}", file=sys.stderr)
        if args.prepare_only or repo is None:
            print("Prepare-only complete." if cfg else "Scaffold ready.")
            return

    assert repo is not None
    cfg = write_config(repo, args.epochs, args.batch)
    if args.prepare_only:
        print("Prepare-only: not starting train.")
        return

    cmd = [sys.executable, str(repo / "tools" / "train.py"), "-c", str(cfg)]
    print("Running:", " ".join(cmd))
    subprocess.check_call(cmd, cwd=str(repo))
    # Export inference model
    export_cmd = [
        sys.executable,
        str(repo / "tools" / "export_model.py"),
        "-c",
        str(cfg),
        "-o",
        f"Global.pretrained_model={(ROOT / 'output' / 'science_rec' / 'best_accuracy').as_posix()}",
        f"Global.save_inference_dir={OUT_INFER.as_posix()}",
    ]
    print("Exporting:", " ".join(export_cmd))
    try:
        subprocess.check_call(export_cmd, cwd=str(repo))
    except subprocess.CalledProcessError as exc:
        print(f"Export failed ({exc}); copy best checkpoint manually into {OUT_INFER}", file=sys.stderr)
        sys.exit(exc.returncode)
    shutil.copy2(CHARSET, OUT_INFER / "science_charset.txt")
    print(f"Done. Point worker at {OUT_INFER}")


if __name__ == "__main__":
    main()
