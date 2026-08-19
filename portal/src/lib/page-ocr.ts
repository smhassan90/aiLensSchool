"use client";

export async function readPagesInBrowser(files: File[]): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
    corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core.wasm.js",
    langPath: "https://tessdata.projectnaptha.com/4.0.0",
  });
  try {
    const pages: string[] = [];
    for (let index = 0; index < files.length; index += 1) {
      const { data } = await worker.recognize(files[index]);
      const text = data.text?.replace(/\u000c/g, "").trim() ?? "";
      if (text) {
        pages.push(files.length > 1 ? `Page ${index + 1}\n${text}` : text);
      }
    }
    return pages.join("\n\n").trim();
  } finally {
    await worker.terminate();
  }
}
