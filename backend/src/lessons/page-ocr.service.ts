import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { createWorker, PSM, type Worker } from 'tesseract.js';

@Injectable()
export class PageOcrService implements OnModuleDestroy {
  private readonly logger = new Logger(PageOcrService.name);
  private workerPromise: Promise<Worker> | null = null;

  private async getWorker() {
    if (!this.workerPromise) {
      const cachePath = join(process.cwd(), '.tesseract-cache');
      this.workerPromise = (async () => {
        await mkdir(cachePath, { recursive: true });
        const worker = await createWorker('eng', 1, { cachePath });
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.AUTO,
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
