#!/usr/bin/env python3
"""
Isolated benchmark: Pix2Text + pix2tex on fractions calibration pages.
Does NOT touch production Paddle env.

Usage (from repo root or backend/eval/specialized-math-ocr):
  backend/eval/math-ocr-eval-venv/Scripts/python.exe run_specialized_math_eval.py
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import traceback
from importlib.metadata import PackageNotFoundError, version as pkg_version
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT.parent.parent
FIXTURES = BACKEND / "test-fixtures" / "fractions-chapter-calibration"
OUT = ROOT / "outputs"
CROPS_JSON = ROOT / "crop_regions.json"
REGION_EVAL = FIXTURES / "region-eval-reports"
DATASET = FIXTURES / "chapter_dataset.json"

PAGES = ["p39-reduce", "p57-divide-grid", "p43-mult-whole"]


def _pkg_ver(name: str) -> str:
    try:
        return pkg_version(name)
    except PackageNotFoundError:
        return "unknown"


def load_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").lower().replace("×", "x").replace("÷", "/")).strip()


def collapse_spaced_digits(s: str) -> str:
    """Pix2Text often emits '1 2' for 12 inside math."""
    prev = None
    out = s or ""
    while out != prev:
        prev = out
        out = re.sub(r"(\d) (\d)", r"\1\2", out)
    return out


def latex_frac_plain(s: str) -> str:
    t = s or ""
    t = re.sub(r"\$+", " ", t)
    t = re.sub(r"\\div\s*", "÷", t)
    t = re.sub(r"\\times\s*", "×", t)
    # \frac{a}{b} and \frac{a} {b}
    for _ in range(8):
        t2 = re.sub(
            r"\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}",
            lambda m: f"{m.group(1).strip()}/{m.group(2).strip()}",
            t,
        )
        if t2 == t:
            break
        t = t2
    t = re.sub(r"\\[a-zA-Z]+\s*", " ", t)
    t = re.sub(r"[{}]", " ", t)
    return collapse_spaced_digits(t)


def math_match_text(s: str) -> str:
    return norm(latex_frac_plain(s))


def snippet_hit(text: str, snippet: str) -> bool:
    t = math_match_text(text)
    s = math_match_text(snippet)
    if not s:
        return True
    return s in t or s.replace(" ", "") in t.replace(" ", "")


def exercise_cell_hit(text: str, label: str, expected: str) -> bool:
    t = math_match_text(text)
    e = math_match_text(expected)
    pat = rf"{re.escape(label.lower())}\s*\.?\s*{re.escape(e)}"
    if re.search(pat, t):
        return True
    if e in t:
        return True
    # label-adjacent substring (grid runs a. … b. … on one line)
    idx = t.find(f"{label.lower()}.")
    if idx >= 0:
        window = t[idx : idx + len(e) + 40]
        if e.replace(" ", "") in window.replace(" ", ""):
            return True
    return False


def _levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            ins = cur[j - 1] + 1
            dele = prev[j] + 1
            sub = prev[j - 1] + (ca != cb)
            cur.append(min(ins, dele, sub))
        prev = cur
    return prev[-1]


def cer(ref: str, hyp: str) -> float | None:
    ref, hyp = math_match_text(ref), math_match_text(hyp)
    if not ref:
        return None
    return 100.0 * _levenshtein(ref, hyp) / len(ref)


def wer(ref: str, hyp: str) -> float | None:
    rw = ref.split()
    hw = hyp.split()
    if not rw:
        return None
    return 100.0 * _levenshtein(" ".join(rw), " ".join(hw)) / len(" ".join(rw))


def metrics_for_text(text: str, snippets: list[str], exercises: list[dict]) -> dict:
    ex_hits = {
        f"{ex['label']}": exercise_cell_hit(text, ex["label"], ex["text"])
        for ex in exercises
        if ex.get("reviewStatus") == "reference"
    }
    sn_hits = {sn: snippet_hit(text, sn) for sn in snippets}
    per_ex_cer = {}
    for ex in exercises:
        if ex.get("reviewStatus") != "reference":
            continue
        c = cer(ex["text"], text)
        if c is not None:
            per_ex_cer[ex["label"]] = round(c, 2)
    return {
        "snippetHits": sn_hits,
        "exerciseHits": ex_hits,
        "exerciseCellCer": per_ex_cer,
        "exerciseExactMatchRate": (
            sum(1 for v in ex_hits.values() if v) / len(ex_hits) if ex_hits else None
        ),
        "textLen": len(text or ""),
    }


def crop_image(path: Path, box_frac: list[float], out_path: Path) -> dict:
    im = Image.open(path).convert("RGB")
    w, h = im.size
    x0, y0, x1, y1 = box_frac
    left, top = int(x0 * w), int(y0 * h)
    right, bottom = int(x1 * w), int(y1 * h)
    crop = im.crop((left, top, right, bottom))
    crop.save(out_path, quality=92)
    return {"width": crop.width, "height": crop.height, "pageWidth": w, "pageHeight": h, "boxPx": [left, top, right, bottom]}


def run_pix2text(image_path: Path, p2t) -> dict:
    t0 = time.perf_counter()
    try:
        # recognize() returns markdown-ish text in recent versions
        out = p2t.recognize(str(image_path))
        if isinstance(out, list):
            text = "\n".join(str(x) for x in out)
        else:
            text = str(out)
        err = None
    except Exception as e:
        text = ""
        err = f"{type(e).__name__}: {e}"
    ms = int((time.perf_counter() - t0) * 1000)
    return {"text": text, "ms": ms, "error": err}


def run_pix2tex(image_path: Path, model) -> dict:
    t0 = time.perf_counter()
    try:
        im = Image.open(image_path).convert("RGB")
        text = model(im)
        err = None
    except Exception as e:
        text = ""
        err = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
    ms = int((time.perf_counter() - t0) * 1000)
    return {"text": text, "ms": ms, "error": err, "format": "latex"}


def recompute_metrics_only():
    """Refresh metrics in comparative_report.json from saved candidate text (no model load)."""
    path = OUT / "comparative_report.json"
    report = load_json(path)
    dataset = load_json(DATASET)
    page_meta = {p["id"]: p for p in dataset["pages"]}
    for pid in PAGES:
        page_out = report.get("pages", {}).get(pid, {})
        snippets = [
            s["text"]
            for s in page_meta[pid].get("verifiedSnippets", [])
            if s.get("reviewStatus") == "reference"
        ]
        exercises = page_meta[pid].get("exerciseItems", [])
        metrics = {}
        for cand_key, cand in page_out.get("candidates", {}).items():
            text = cand.get("text", "")
            m = metrics_for_text(text, snippets, exercises)
            m["ms"] = cand.get("ms")
            m["error"] = cand.get("error")
            for sn in snippets:
                c = cer(sn, text)
                if c is not None:
                    m.setdefault("snippetCer", {})[sn] = round(c, 2)
            metrics[cand_key] = m
        page_out["metrics"] = metrics
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Updated metrics in {path}")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    if os.environ.get("METRICS_ONLY") == "1":
        recompute_metrics_only()
        return
    crops_cfg = load_json(CROPS_JSON)
    dataset = load_json(DATASET)
    page_meta = {p["id"]: p for p in dataset["pages"]}

    report = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "environment": {
            "python": sys.version,
            "pix2text": None,
            "pix2tex": None,
            "venv": str(Path(sys.executable).parent.parent),
        },
        "referenceQuality": {},
        "pages": {},
    }

    # Baselines A-D from prior region-eval if present
    for pid in PAGES:
        ref_path = REGION_EVAL / f"{pid}.json"
        if ref_path.is_file():
            rev = load_json(ref_path)
            v = rev.get("variants", {})
            report["pages"].setdefault(pid, {})["baseline_ABCD"] = {
                "A_paddle": v.get("A", {}).get("text", "")[:8000],
                "B_tesseract": v.get("B", {}).get("text", "")[:8000],
                "C_merge": v.get("C", {}).get("text", "")[:8000],
                "D_region_retry": v.get("D", {}).get("text", "")[:8000],
                "engineMs": rev.get("engineMs"),
                "regionMs": rev.get("regionMs"),
                "variantMetrics": {
                    k: {
                        "cer": v.get(k, {}).get("cer"),
                        "wer": v.get(k, {}).get("wer"),
                        "fracScore": v.get(k, {}).get("fracScore"),
                        "snippetHitRate": v.get(k, {}).get("snippetHitRate"),
                    }
                    for k in ("A", "B", "C", "D")
                },
            }
        else:
            report["pages"].setdefault(pid, {})["baseline_ABCD"] = {"missing": str(ref_path)}

    meta = page_meta.get("p39-reduce", {})
    report["referenceQuality"]["p39-reduce"] = {
        "verifiedSnippets": meta.get("verifiedSnippets", []),
        "note": "Only snippet-level reference (Reduce 28/40). Full worked solution REQUIRES_ANNOTATION.",
        "exerciseItems": meta.get("exerciseItems", []),
    }
    meta57 = page_meta.get("p57-divide-grid", {})
    report["referenceQuality"]["p57-divide-grid"] = {
        "verifiedSnippets": meta57.get("verifiedSnippets", []),
        "exerciseItems": meta57.get("exerciseItems", []),
        "note": "Exercise cells are human-curated labels for metrics; not full-page transcript.",
    }
    meta43 = page_meta.get("p43-mult-whole", {})
    report["referenceQuality"]["p43-mult-whole"] = {
        "verifiedSnippets": meta43.get("verifiedSnippets", []),
        "note": "Snippet-level only.",
    }

    print("Loading Pix2Text (cold start may download weights)...")
    p2t = None
    p2t_err = None
    try:
        from pix2text import Pix2Text

        t0 = time.perf_counter()
        p2t = Pix2Text()
        load_ms = int((time.perf_counter() - t0) * 1000)
        report["environment"]["pix2text"] = {
            "version": _pkg_ver("pix2text"),
            "loadMs": load_ms,
            "license": "MIT (Pix2Text); cnstd Apache-2.0",
            "rapidocrPin": "3.9.1 (required for cnstd resolve_model_key)",
        }
    except Exception as e:
        p2t_err = traceback.format_exc()
        report["environment"]["pix2text"] = {"error": p2t_err}

    print("Loading pix2tex...")
    pix_model = None
    try:
        from pix2tex.cli import LatexOCR

        t0 = time.perf_counter()
        pix_model = LatexOCR()
        load_ms = int((time.perf_counter() - t0) * 1000)
        report["environment"]["pix2tex"] = {
            "version": _pkg_ver("pix2tex"),
            "loadMs": load_ms,
            "license": "MIT (verify upstream LaTeX-OCR)",
        }
    except Exception as e:
        report["environment"]["pix2tex"] = {"error": traceback.format_exc()}

    for pid in PAGES:
        img_name = page_meta[pid]["image"]
        img_path = FIXTURES / img_name
        if not img_path.is_file():
            report["pages"][pid]["error"] = f"missing image {img_path}"
            continue

        page_out = report["pages"].setdefault(pid, {})
        page_out["image"] = str(img_path)
        regions = crops_cfg["pages"].get(pid, {})
        page_out["candidates"] = {}

        for region_name, box in regions.items():
            crop_path = OUT / f"{pid}__{region_name}.jpg"
            meta_crop = crop_image(img_path, box, crop_path)
            entry = {"cropMeta": meta_crop, "cropPath": str(crop_path)}

            if p2t:
                key_e = f"E_pix2text_{region_name}"
                raw = run_pix2text(crop_path if region_name != "full" else img_path, p2t)
                entry["pix2text"] = raw
                (OUT / f"{pid}__{region_name}__pix2text.txt").write_text(
                    raw.get("text", ""), encoding="utf-8"
                )
                page_out["candidates"][key_e] = raw

            if pix_model and region_name != "full":
                key_f = f"F_pix2tex_{region_name}"
                raw = run_pix2tex(crop_path, pix_model)
                entry["pix2tex"] = raw
                (OUT / f"{pid}__{region_name}__pix2tex.txt").write_text(
                    raw.get("text", ""), encoding="utf-8"
                )
                page_out["candidates"][key_f] = raw

            page_out.setdefault("regions", {})[region_name] = entry

        # Metrics vs references
        snippets = [
            s["text"]
            for s in page_meta[pid].get("verifiedSnippets", [])
            if s.get("reviewStatus") == "reference"
        ]
        exercises = page_meta[pid].get("exerciseItems", [])
        metrics = {}
        for cand_key, cand in page_out.get("candidates", {}).items():
            text = cand.get("text", "")
            m = metrics_for_text(text, snippets, exercises)
            m["ms"] = cand.get("ms")
            m["error"] = cand.get("error")
            for sn in snippets:
                c = cer(sn, text)
                if c is not None:
                    m.setdefault("snippetCer", {})[sn] = round(c, 2)
            metrics[cand_key] = m
        page_out["metrics"] = metrics
        print(f"Done {pid}")

    out_json = OUT / "comparative_report.json"
    out_json.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {out_json}")

    md = OUT / "SUMMARY.md"
    lines = [
        "# Specialized math OCR evaluation",
        "",
        f"Generated: {report['generatedAt']}",
        "",
        "## Reference quality",
        "",
    ]
    for k, v in report["referenceQuality"].items():
        lines.append(f"### {k}")
        lines.append(f"- {v.get('note', '')}")
        lines.append("")
    env = report.get("environment", {})
    lines.extend(
        [
            "## Environment",
            "",
            f"- Python: `{env.get('python', '')[:80]}`",
            f"- Pix2Text: {json.dumps(env.get('pix2text'), ensure_ascii=False)}",
            f"- pix2tex: {json.dumps(env.get('pix2tex'), ensure_ascii=False)}",
            "",
            "## Install and run",
            "",
            "```powershell",
            "cd backend/eval/specialized-math-ocr",
            "python -m venv ..\\math-ocr-eval-venv",
            "..\\math-ocr-eval-venv\\Scripts\\pip install -r requirements-eval.txt",
            "..\\math-ocr-eval-venv\\Scripts\\python.exe run_specialized_math_eval.py",
            "```",
            "",
            "## Hybrid (G)",
            "",
            "Not benchmarked: no candidate E/F beat baselines on verified exercise cells or snippets.",
            "",
            "## Integration decision",
            "",
            "See `docs/SPECIALIZED_MATH_OCR_EVAL.md` for the full recommendation.",
            "",
        ]
    )
    md.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {md}")


if __name__ == "__main__":
    main()
