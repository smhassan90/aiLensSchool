import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { isServerlessRuntime } from '../common/env';

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

@Injectable()
export class PageOcrService implements OnModuleDestroy {
  private readonly logger = new Logger(PageOcrService.name);
  private poolLangs: string | null = null;
  private poolWorkers: Promise<OcrWorker>[] | null = null;

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

  async readPages(
    files: Array<{ buffer: Buffer; mimetype?: string; originalname?: string }>,
    options?: { subjectName?: string | null },
  ) {
    if (isServerlessRuntime()) {
      this.logger.log('Skipping Tesseract on serverless to avoid function timeouts');
      return '';
    }
    if (!files.length) return '';

    const languages = ocrLanguagesForSubject(options?.subjectName);
    let workers: OcrWorker[];
    try {
      workers = await this.getPool(languages);
    } catch (error) {
      // Urdu pack may be missing in some installs — fall back to English.
      if (languages !== 'eng') {
        this.logger.warn(
          `OCR languages ${languages} failed (${error instanceof Error ? error.message : String(error)}); falling back to eng`,
        );
        workers = await this.getPool('eng');
      } else {
        throw error;
      }
    }

    const pages = await mapPool(files, workers.length, async (file, index) => {
      const worker = workers[index % workers.length];
      const source = this.toDataUrl(file);
      try {
        const result = await worker.recognize(source);
        const text = result.data.text?.replace(/\u000c/g, '').trim() ?? '';
        this.logger.log(
          `OCR page ${index + 1}: ${text.length} characters from ${file.originalname ?? 'photo'} (${this.poolLangs})`,
        );
        if (!text) return '';
        return files.length > 1 ? `Page ${index + 1}\n${text}` : text;
      } catch (error) {
        this.logger.warn(
          `OCR failed for page ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return '';
      }
    });

    return pages.filter(Boolean).join('\n\n').trim();
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
