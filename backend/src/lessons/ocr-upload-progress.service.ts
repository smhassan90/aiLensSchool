import { Injectable } from '@nestjs/common';
import { MemoryCacheService } from '../common/services/memory-cache.service';

export type OcrEngineStepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';

export type OcrUploadProgressSnapshot = {
  uploadId: string;
  lessonId: string;
  fileName?: string;
  pageLabel?: string;
  phase:
    | 'queued'
    | 'orienting'
    | 'paddle'
    | 'tesseract'
    | 'engines'
    | 'saving'
    | 'merging'
    | 'next_page'
    | 'done'
    | 'error';
  message: string;
  paddle: OcrEngineStepStatus;
  tesseract: OcrEngineStepStatus;
  merge: OcrEngineStepStatus;
  updatedAt: number;
};

const TTL_MS = 10 * 60 * 1000;

@Injectable()
export class OcrUploadProgressService {
  constructor(private readonly cache: MemoryCacheService) {}

  private key(uploadId: string) {
    return `ocr-upload:${uploadId}`;
  }

  start(uploadId: string, lessonId: string, fileName?: string) {
    this.set(uploadId, {
      uploadId,
      lessonId,
      fileName,
      phase: 'queued',
      message: 'Starting page OCR…',
      paddle: 'pending',
      tesseract: 'pending',
      merge: 'pending',
      updatedAt: Date.now(),
    });
  }

  patch(uploadId: string, patch: Partial<OcrUploadProgressSnapshot>) {
    const prev = this.get(uploadId);
    if (!prev) return;
    this.set(uploadId, { ...prev, ...patch, updatedAt: Date.now() });
  }

  get(uploadId: string): OcrUploadProgressSnapshot | null {
    const hit = this.cache.get<OcrUploadProgressSnapshot>(this.key(uploadId));
    return hit ?? null;
  }

  clear(uploadId: string) {
    this.cache.del(this.key(uploadId));
  }

  private set(uploadId: string, snapshot: OcrUploadProgressSnapshot) {
    this.cache.set(this.key(uploadId), snapshot, TTL_MS);
  }
}
