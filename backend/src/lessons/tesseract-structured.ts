import type { OcrStructuredLine } from './ocr-structured-line';

type TessBBox = { x0?: number; y0?: number; x1?: number; y1?: number };

/** Best-effort line boxes from tesseract.js recognize() payload. */
export function tesseractLinesFromRecognizeData(data: unknown): OcrStructuredLine[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as {
    lines?: Array<{ text?: string; confidence?: number; bbox?: TessBBox }>;
    words?: Array<{ text?: string; confidence?: number; bbox?: TessBBox }>;
  };
  const source = d.lines?.length ? d.lines : d.words;
  if (!source?.length) return [];
  const lines: OcrStructuredLine[] = [];
  for (const row of source) {
    const text = (row.text ?? '').trim();
    if (!text) continue;
    const bb = row.bbox ?? {};
    const x0 = Number(bb.x0 ?? 0);
    const y0 = Number(bb.y0 ?? lines.length);
    const x1 = Number(bb.x1 ?? x0 + 1);
    const y1 = Number(bb.y1 ?? y0 + 1);
    lines.push({
      text,
      x0,
      y0,
      x1,
      y1,
      confidence:
        typeof row.confidence === 'number' ? row.confidence / 100 : undefined,
      engine: 'tesseract',
    });
  }
  return lines;
}
