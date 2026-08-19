import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { isServerlessRuntime } from '../common/env';

type OcrWorker = {
  setParameters: (params: Record<string, string>) => Promise<unknown>;
  recognize: (source: string) => Promise<{ data: { text?: string } }>;
  terminate: () => Promise<unknown>;
};

@Injectable()
export class PageOcrService implements OnModuleDestroy {
  private readonly logger = new Logger(PageOcrService.name);
  private workerPromise: Promise<OcrWorker> | null = null;

  constructor(private readonly config: ConfigService) {}

  private canUseVision() {
    return Boolean(this.config.get<string>('OPENAI_API_KEY')?.trim());
  }

  private async getWorker() {
    if (!this.workerPromise) {
      // Vercel cwd is /var/task and cannot create folders. os.tmpdir() is /tmp there.
      const cachePath = join(tmpdir(), 'ailens-tesseract-cache');
      this.workerPromise = (async () => {
        const tesseract = await import('tesseract.js');
        await mkdir(cachePath, { recursive: true });
        const worker = (await tesseract.createWorker('eng', 1, {
          cachePath,
          cacheMethod: 'write',
        })) as OcrWorker;
        await worker.setParameters({
          tessedit_pageseg_mode: String(tesseract.PSM.AUTO),
          preserve_interword_spaces: '1',
          user_defined_dpi: '300',
        });
        return worker;
      })().catch((error) => {
        this.workerPromise = null;
        throw error;
      });
    }
    return this.workerPromise;
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

  async readPages(files: Array<{ buffer: Buffer; mimetype?: string; originalname?: string }>) {
    if (isServerlessRuntime() && this.canUseVision()) {
      this.logger.log('Skipping Tesseract on serverless; photos will be read by vision');
      return '';
    }

    const worker = await this.getWorker();
    const pages: string[] = [];

    for (let index = 0; index < files.length; index += 1) {
      const source = this.toDataUrl(files[index]);
      try {
        const result = await worker.recognize(source);
        const text = result.data.text?.replace(/\u000c/g, '').trim() ?? '';
        this.logger.log(
          `OCR page ${index + 1}: ${text.length} characters from ${files[index].originalname ?? 'photo'}`,
        );
        if (text) {
          pages.push(files.length > 1 ? `Page ${index + 1}\n${text}` : text);
        }
      } catch (error) {
        this.logger.warn(
          `OCR failed for page ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return pages.join('\n\n').trim();
  }

  async onModuleDestroy() {
    if (!this.workerPromise) return;
    try {
      const worker = await this.workerPromise;
      await worker.terminate();
    } catch {
      // Worker may not have finished starting.
    } finally {
      this.workerPromise = null;
    }
  }
}
