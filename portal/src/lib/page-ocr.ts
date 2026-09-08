"use client";

/**
 * Browser Tesseract cannot reliably read Nastaliq Urdu.
 * For Islamiat/Urdu/Arabic pages, skip client OCR and let the server use vision.
 */
export function shouldUseBrowserOcr(subjectName?: string) {
  const name = (subjectName ?? "").toLowerCase();
  if (/islam|urdu|arabic|nazra|qaida|quran|sindhi|قرآن|اسلام|اردو/.test(name)) {
    return false;
  }
  return true;
}

const ARABIC_SCRIPT =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;

/** English OCR turned Urdu/Arabic into Latin gibberish — discard and use server vision. */
function looksLikeMangledRtlOcr(text: string) {
  const value = text.trim();
  if (!value) return false;
  const arabic = (value.match(ARABIC_SCRIPT) ?? []).length;
  if (arabic >= 40) return false;
  if (
    /(?:Muhammad|Quaid[\s-]?e[\s-]?Azam|Allama|Iqbal|Igbal|Prophet).{0,20}(?:«|»|\bele\b|\begle|\ballis\b|\bX55\b|\bFR\b\s*di)/i.test(
      value,
    )
  ) {
    return true;
  }
  const citesIslamicSource =
    /Qur['’]?an|Holy\s+Quran|Hadith|Hujjat|Bukhari|سورۃ|ترجمہ|Akhuwat|Hujat/i.test(value);
  const weirdTokens =
    value.match(
      /(?:^|\s)(?:[A-Za-z]{1,4}[)(@0-9£€«»]{1,5}|[)(@0-9£€«»]{1,4}[A-Za-z]{1,5}|[A-Za-z]{1,3}\d+[A-Za-z]{0,3})(?=\s|$|[«»])/g,
    ) ?? [];
  if (citesIslamicSource && arabic < 20 && weirdTokens.length >= 3) return true;
  if ((value.match(/[«»]/g) ?? []).length >= 3 && arabic < 30) return true;
  if (weirdTokens.length >= 8 && arabic < 20) return true;
  const junkHits = value.match(
    /\b(?:SNUB|Udi|nid|Sib|ditt|SABA|Sot|Sure|smi|piso|fios|Kozel|BAG|Jo\s+Lf)\b/gi,
  );
  return (junkHits?.length ?? 0) >= 3 && arabic < 20;
}

const OCR_MAX_EDGE = 1800;
const OCR_CONCURRENCY = 2;

/** Downscale for faster OCR/upload while keeping textbook text readable. */
async function downscaleForOcr(file: File, maxEdge = OCR_MAX_EDGE): Promise<Blob> {
  if (typeof createImageBitmap === "undefined") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    if (scale >= 0.95) {
      bitmap.close();
      return file;
    }
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

/** Compress photos before upload (smaller payload over the network). */
export async function compressPhotosForUpload(files: File[], maxEdge = 1600): Promise<File[]> {
  const out: File[] = [];
  for (const file of files) {
    const blob = await downscaleForOcr(file, maxEdge);
    if (blob === file) {
      out.push(file);
      continue;
    }
    const name = file.name.replace(/\.\w+$/, "") + ".jpg";
    out.push(new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified }));
  }
  return out;
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index], index);
    }
  }
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(runners);
  return results;
}

export async function readPagesInBrowser(files: File[], subjectName?: string): Promise<string> {
  if (!shouldUseBrowserOcr(subjectName)) {
    return "";
  }
  if (!files.length) return "";

  const prepared = await Promise.all(files.map((file) => downscaleForOcr(file)));
  const { createWorker } = await import("tesseract.js");

  const workerCount = Math.min(OCR_CONCURRENCY, prepared.length);
  const workers = await Promise.all(
    Array.from({ length: workerCount }, () =>
      createWorker("eng", 1, {
        workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
        corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core.wasm.js",
        langPath: "https://tessdata.projectnaptha.com/4.0.0",
      }),
    ),
  );

  try {
    const pages = await mapPool(prepared, workerCount, async (source, index) => {
      const worker = workers[index % workers.length];
      const { data } = await worker.recognize(source);
      const text = data.text?.replace(/\u000c/g, "").trim() ?? "";
      if (!text) return "";
      return files.length > 1 ? `Page ${index + 1}\n${text}` : text;
    });
    const joined = pages.filter(Boolean).join("\n\n").trim();
    // Mixed English+Urdu pages: eng OCR mangles Arabic — let the server use vision.
    if (looksLikeMangledRtlOcr(joined)) return "";
    return joined;
  } finally {
    await Promise.all(workers.map((w) => w.terminate()));
  }
}
