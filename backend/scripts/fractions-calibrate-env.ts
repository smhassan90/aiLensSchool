import { existsSync } from 'fs';
import { join } from 'path';
import { readEnv } from '../src/common/env';

export function workerScriptPath(): string {
  const candidates = [
    join(process.cwd(), 'ocr', 'paddle_ocr_worker.py'),
    join(process.cwd(), 'backend', 'ocr', 'paddle_ocr_worker.py'),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0];
}

export function pythonBinary(): string {
  return readEnv('PADDLE_OCR_PYTHON') || readEnv('PYTHON') || (process.platform === 'win32' ? 'python' : 'python3');
}
