import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

export interface StoredFile {
  storageKey: string;
  url: string;
  size: number;
}

@Injectable()
export class LocalStorageService {
  private readonly basePath: string;

  constructor(private readonly config: ConfigService) {
    this.basePath = this.config.get<string>('LOCAL_STORAGE_PATH') ?? './uploads';
  }

  async save(file: Express.Multer.File, folder = 'general'): Promise<StoredFile> {
    const dir = join(this.basePath, folder);
    await fs.mkdir(dir, { recursive: true });
    const ext = file.originalname.includes('.')
      ? file.originalname.slice(file.originalname.lastIndexOf('.'))
      : '';
    const storageKey = `${folder}/${randomUUID()}${ext}`;
    const fullPath = join(this.basePath, storageKey);
    await fs.writeFile(fullPath, file.buffer);
    return {
      storageKey,
      url: `/uploads/${storageKey}`,
      size: file.size,
    };
  }

  async delete(storageKey: string): Promise<void> {
    const fullPath = join(this.basePath, storageKey);
    try {
      await fs.unlink(fullPath);
    } catch {
      // ignore missing file
    }
  }
}
