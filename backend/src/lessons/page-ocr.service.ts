import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { isServerlessRuntime } from '../common/env';
import { mergePaddleAndTesseractPageOcr } from './merge-paddle-tesseract-ocr';
import {
  englishPageTranscriptLooksIncomplete,
  isPagePhotoTextReadable,
  pickBetterPageTranscript,
  scorePageOcrQuality,
} from './page-text-sanitize';
import {
  ocrEngineMode,
  paddleOcrEnabled,
  runPaddleOcrOnBuffer,
} from './paddle-ocr.runner';

type OcrWorker = {
  setParameters: (params: Record<string, string>) => Promise<unknown>;
  recognize: (source: string) => Promise<{ data: { text?: string } }>;
  terminate: () => Promise<unknown>;
};

const OCR_POOL_SIZE = 2;

/** Prefer Urdu/Arabic packs for Islamiat and related subjects. */
export function ocrLanguagesForSubject(subjectName?: string | null): string {
  const name = (subjectName ?? '').toLowerCase();
  if (
    /islam|islamiyat|islamiyat|urdu|arabic|nazra|nazira|qaida|quran|qur.?an|sindhi|قرآن|اسلام|اردو/.test(
      name,
    )
  ) {
    return 'eng+urd+ara';
  }
  return 'eng';
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function compactLen(text: string): number {
  return text.replace(/\s+/g, '').length;
}

/** Pick the stronger OCR transcript while we evaluate Paddle vs Tesseract. */
export function preferOcrTranscript(paddleText: string, tesseractText: string): {
  text: string;
  engine: 'paddle' | 'tesseract' | 'none';
} {
  const paddle = (paddleText ?? '').trim();
  const tess = (tesseractText ?? '').trim();
  if (!paddle && !tess) return { text: '', engine: 'none' };
  if (!paddle) return { text: tess, engine: 'tesseract' };
  if (!tess) return { text: paddle, engine: 'paddle' };

  const paddleIncomplete = englishPageTranscriptLooksIncomplete(paddle);
  const tessIncomplete = englishPageTranscriptLooksIncomplete(tess);
  if (!paddleIncomplete && tessIncomplete) return { text: paddle, engine: 'paddle' };
  if (!tessIncomplete && paddleIncomplete) return { text: tess, engine: 'tesseract' };

  const paddleReadable = isPagePhotoTextReadable(paddle);
  const tessReadable = isPagePhotoTextReadable(tess);
  if (paddleReadable && !tessReadable) return { text: paddle, engine: 'paddle' };
  if (tessReadable && !paddleReadable) return { text: tess, engine: 'tesseract' };

  const paddleLen = compactLen(paddle);
  const tessLen = compactLen(tess);
  // Title-only OCR can score "cleaner" than a full noisy poem page — prefer substance.
  if (paddleLen >= tessLen + 80) return { text: paddle, engine: 'paddle' };
  if (tessLen >= paddleLen + 80) return { text: tess, engine: 'tesseract' };

  const better = pickBetterPageTranscript(paddle, tess);
  if (better === tess && paddleLen >= tessLen * 0.9) {
    const pScore = scorePageOcrQuality(paddle);
    const tScore = scorePageOcrQuality(tess);
    if (pScore >= tScore - 10) {
      return { text: paddle, engine: 'paddle' };
    }
  }
  return { text: better, engine: better === tess ? 'tesseract' : 'paddle' };
}

export type PageOcrEngineBreakdown = {
  paddle: string;
  tesseract: string;
  merged: string;
};

@Injectable()
export class PageOcrService implements OnModuleDestroy {
  private readonly logger = new Logger(PageOcrService.name);
  private poolLangs: string | null = null;
  private poolWorkers: Promise<OcrWorker>[] | null = null;
  private paddleMissingLogged = false;

  private async createWorker(languages: string) {
    const cachePath = join(tmpdir(), 'ailens-tesseract-cache');
    const tesseract = await import('tesseract.js');
    await mkdir(cachePath, { recursive: true });
    this.logger.log(`Starting Tesseract worker languages=${languages}`);
    const worker = (await tesseract.createWorker(languages, 1, {
      cachePath,
      cacheMethod: 'write',
    })) as OcrWorker;
    await worker.setParameters({
      tessedit_pageseg_mode: String(tesseract.PSM.AUTO),
      preserve_interword_spaces: '1',
      // 220 DPI is enough for phone textbook photos and noticeably faster than 300.
      user_defined_dpi: '220',
    });
    return worker;
  }

  private async getPool(languages: string) {
    if (this.poolWorkers && this.poolLangs === languages) {
      return Promise.all(this.poolWorkers);
    }
    if (this.poolWorkers) {
      try {
        const previous = await Promise.all(this.poolWorkers);
        await Promise.all(previous.map((worker) => worker.terminate()));
      } catch {
        // ignore stale worker shutdown errors
      }
      this.poolWorkers = null;
      this.poolLangs = null;
    }

    this.poolLangs = languages;
    this.poolWorkers = Array.from({ length: OCR_POOL_SIZE }, () => this.createWorker(languages));
    try {
      return await Promise.all(this.poolWorkers);
    } catch (error) {
      this.poolWorkers = null;
      this.poolLangs = null;
      throw error;
    }
  }

  private toDataUrl(file: { buffer: Buffer; mimetype?: string; originalname?: string }) {
    const name = file.originalname?.toLowerCase() ?? '';
    let mime = file.mimetype?.toLowerCase() || '';
    if (!mime.startsWith('image/')) {
      if (name.endsWith('.png')) mime = 'image/png';
      else if (name.endsWith('.webp')) mime = 'image/webp';
      else mime = 'image/jpeg';
    }
    return `data:${mime};base64,${file.buffer.toString('base64')}`;
  }

  private async readWithTesseract(
    files: Array<{ buffer: Buffer; mimetype?: string; originalname?: string }>,
    options?: { subjectName?: string | null },
  ): Promise<string[]> {
    if (!files.length) return [];

    const languages = ocrLanguagesForSubject(options?.subjectName);
    let workers: OcrWorker[];
    try {
      workers = await this.getPool(languages);
    } catch (error) {
      if (languages !== 'eng') {
        this.logger.warn(
          `OCR languages ${languages} failed (${error instanceof Error ? error.message : String(error)}); falling back to eng`,
        );
        workers = await this.getPool('eng');
      } else {
        throw error;
      }
    }

    return mapPool(files, workers.length, async (file, index) => {
      const worker = workers[index % workers.length];
      const source = this.toDataUrl(file);
      try {
        const tesseract = await import('tesseract.js');
        const clean = (raw: string) => raw.replace(/\u000c/g, '').trim();
        const resultAuto = await worker.recognize(source);
        const autoText = clean(resultAuto.data.text ?? '');
        await worker.setParameters({
          tessedit_pageseg_mode: String(tesseract.PSM.SINGLE_BLOCK),
        });
        const resultBlock = await worker.recognize(source);
        const blockText = clean(resultBlock.data.text ?? '');
        await worker.setParameters({
          tessedit_pageseg_mode: String(tesseract.PSM.AUTO),
        });
        const text = pickBetterPageTranscript(autoText, blockText);
        this.logger.log(
          `Tesseract page ${index + 1}: ${text.length} characters from ${file.originalname ?? 'photo'} (${this.poolLangs})`,
        );
        return text;
      } catch (error) {
        this.logger.warn(
          `Tesseract failed for page ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return '';
      }
    });
  }

  private async readWithPaddle(
    files: Array<{ buffer: Buffer; mimetype?: string; originalname?: string }>,
    options?: { subjectName?: string | null },
  ): Promise<string[]> {
    if (!paddleOcrEnabled() || !files.length) {
      return files.map(() => '');
    }
    return mapPool(files, 1, async (file, index) => {
      const result = await runPaddleOcrOnBuffer(file, { subjectName: options?.subjectName });
      if (!result.ok) {
        if (!this.paddleMissingLogged) {
          this.paddleMissingLogged = true;
          this.logger.warn(
            `PaddleOCR not used (${result.error ?? 'unavailable'}); keeping Tesseract. Install backend/ocr/requirements-paddle.txt to enable.`,
          );
        }
        return '';
      }
      this.logger.log(
        `PaddleOCR page ${index + 1}: ${result.text.length} characters from ${file.originalname ?? 'photo'}`,
      );
      return result.text;
    });
  }

  /**
   * Dual-engine OCR: Paddle first, then Tesseract; merge transcripts (no pick-one).
   * OCR_ENGINE=tesseract skips Paddle. OCR_ENGINE=paddle|auto runs both when Paddle is installed.
   */
  private async readPageTextsDual(
    files: Array<{ buffer: Buffer; mimetype?: string; originalname?: string }>,
    options?: { subjectName?: string | null },
  ): Promise<string[]> {
    const mode = ocrEngineMode();

    if (mode === 'tesseract') {
      return this.readWithTesseract(files, options);
    }

    const [paddleTexts, tessTexts] = await Promise.all([
      this.readWithPaddle(files, options),
      this.readWithTesseract(files, options),
    ]);

    return files.map((_, index) => {
      const paddle = paddleTexts[index] ?? '';
      const tess = tessTexts[index] ?? '';
      const merged = mergePaddleAndTesseractPageOcr(paddle, tess);
      if (paddle.trim() || tess.trim()) {
        this.logger.log(
          `OCR page ${index + 1} merged paddle+tesseract (paddle=${paddle.length}ch tess=${tess.length}ch out=${merged.length}ch)`,
        );
      }
      return merged;
    });
  }

  /** Paddle and Tesseract on the same image in parallel (merge is separate). */
  async readPageOcrEnginesParallel(
    files: Array<{ buffer: Buffer; mimetype?: string; originalname?: string }>,
    options?: {
      subjectName?: string | null;
      onEngineProgress?: (engine: 'paddle' | 'tesseract', status: 'running' | 'done' | 'skipped') => void;
    },
  ): Promise<Array<{ paddle: string; tesseract: string }>> {
    if (isServerlessRuntime() || !files.length) {
      return files.map(() => ({ paddle: '', tesseract: '' }));
    }
    const mode = ocrEngineMode();
    const onProg = options?.onEngineProgress;
    const paddlePromise =
      mode === 'tesseract'
        ? Promise.resolve(files.map(() => ''))
        : (async () => {
            onProg?.('paddle', 'running');
            const rows = await this.readWithPaddle(files, { subjectName: options?.subjectName });
            onProg?.('paddle', 'done');
            return rows;
          })();
    const tessPromise = (async () => {
      onProg?.('tesseract', 'running');
      const rows = await this.readWithTesseract(files, { subjectName: options?.subjectName });
      onProg?.('tesseract', 'done');
      return rows;
    })();
    if (mode === 'tesseract') {
      onProg?.('paddle', 'skipped');
    }
    const [paddleTexts, tessTexts] = await Promise.all([paddlePromise, tessPromise]);
    return files.map((_, index) => ({
      paddle: (paddleTexts[index] ?? '').trim(),
      tesseract: (tessTexts[index] ?? '').trim(),
    }));
  }

  /** Paddle and Tesseract on the same image buffer (engines in parallel, then merge). */
  async readPageOcrBreakdown(
    files: Array<{ buffer: Buffer; mimetype?: string; originalname?: string }>,
    options?: { subjectName?: string | null },
  ): Promise<PageOcrEngineBreakdown[]> {
    const engines = await this.readPageOcrEnginesParallel(files, options);
    return engines.map(({ paddle, tesseract }) => ({
      paddle,
      tesseract,
      merged: mergePaddleAndTesseractPageOcr(paddle, tesseract),
    }));
  }

  async readPages(
    files: Array<{ buffer: Buffer; mimetype?: string; originalname?: string }>,
    options?: { subjectName?: string | null },
  ) {
    if (isServerlessRuntime()) {
      this.logger.log('Skipping local OCR on serverless to avoid function timeouts');
      return '';
    }
    if (!files.length) return '';

    const texts = await this.readPageTextsDual(files, options);
    const pages = texts.map((text, index) => {
      if (!text) return '';
      return files.length > 1 ? `Page ${index + 1}\n${text}` : text;
    });
    return pages.filter(Boolean).join('\n\n').trim();
  }

  /** One OCR string per file (no "Page N" prefix), same order as input files. */
  async readPageTexts(
    files: Array<{ buffer: Buffer; mimetype?: string; originalname?: string }>,
    options?: { subjectName?: string | null },
  ): Promise<string[]> {
    if (isServerlessRuntime() || !files.length) {
      return files.map(() => '');
    }
    return this.readPageTextsDual(files, options);
  }

  async onModuleDestroy() {
    if (!this.poolWorkers) return;
    try {
      const workers = await Promise.all(this.poolWorkers);
      await Promise.all(workers.map((worker) => worker.terminate()));
    } catch {
      // Worker may not have finished starting.
    } finally {
      this.poolWorkers = null;
      this.poolLangs = null;
    }
  }
}
