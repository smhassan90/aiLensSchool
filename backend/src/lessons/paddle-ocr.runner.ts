import { Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { readEnv } from '../common/env';

const logger = new Logger('PaddleOcrRunner');

export type PaddleOcrResult = {
  ok: boolean;
  text: string;
  error?: string;
};

function workerScriptPath(): string {
  // Prefer source path in monorepo / Docker COPY of ocr/
  const candidates = [
    join(process.cwd(), 'ocr', 'paddle_ocr_worker.py'),
    join(__dirname, '..', '..', 'ocr', 'paddle_ocr_worker.py'),
    join(process.cwd(), 'backend', 'ocr', 'paddle_ocr_worker.py'),
  ];
  return candidates.find((path) => existsSync(path)) ?? candidates[0];
}

function pythonBinary(): string {
  return (
    readEnv('PADDLE_OCR_PYTHON') ||
    readEnv('PYTHON') ||
    (process.platform === 'win32' ? 'python' : 'python3')
  );
}

/** true when OCR_ENGINE is paddle|auto (default auto). */
export function paddleOcrEnabled(): boolean {
  const engine = (readEnv('OCR_ENGINE') ?? 'auto').toLowerCase();
  if (engine === 'tesseract') return false;
  if (engine === 'paddle' || engine === 'auto') return true;
  if (readEnv('PADDLE_OCR_ENABLED') === '0') return false;
  return true;
}

export function ocrEngineMode(): 'auto' | 'paddle' | 'tesseract' {
  const engine = (readEnv('OCR_ENGINE') ?? 'auto').toLowerCase();
  if (engine === 'paddle' || engine === 'tesseract') return engine;
  return 'auto';
}

function paddleLangHint(subjectName?: string | null): string {
  const name = (subjectName ?? '').toLowerCase();
  if (/islam|urdu|arabic|nazra|qaida|quran|sindhi|قرآن|اسلام|اردو/.test(name)) {
    return 'arabic';
  }
  return 'en';
}

function mimeToExt(mime?: string, name?: string): string {
  const n = (name ?? '').toLowerCase();
  const m = (mime ?? '').toLowerCase();
  if (m.includes('png') || n.endsWith('.png')) return '.png';
  if (m.includes('webp') || n.endsWith('.webp')) return '.webp';
  return '.jpg';
}

/**
 * Run PaddleOCR via the Python worker. Returns empty text (ok:false) when
 * Python/Paddle is missing so callers can fall back to Tesseract.
 */
export async function runPaddleOcrOnBuffer(
  file: { buffer: Buffer; mimetype?: string; originalname?: string },
  options?: { subjectName?: string | null; timeoutMs?: number },
): Promise<PaddleOcrResult> {
  if (!paddleOcrEnabled()) {
    return { ok: false, text: '', error: 'PaddleOCR disabled' };
  }

  // Top-band second pass + model load can exceed 90s on cold start / CPU.
  const timeoutMs = options?.timeoutMs ?? Number(readEnv('PADDLE_OCR_TIMEOUT_MS') ?? 180000);
  const dir = await mkdtemp(join(tmpdir(), 'ailens-paddle-'));
  const imagePath = join(dir, `page${mimeToExt(file.mimetype, file.originalname)}`);
  const script = readEnv('PADDLE_OCR_WORKER') || workerScriptPath();

  try {
    await writeFile(imagePath, file.buffer);
    const args = [
      script,
      '--image',
      imagePath,
      '--lang',
      paddleLangHint(options?.subjectName),
    ];
    const text = await new Promise<string>((resolve, reject) => {
      const child = spawn(pythonBinary(), args, {
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`PaddleOCR timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0 && !stdout.trim()) {
          reject(
            new Error(
              stderr.trim() || `PaddleOCR exited with code ${code ?? 'unknown'}`,
            ),
          );
          return;
        }
        resolve(stdout.trim());
      });
    });

    const lastLine = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .pop();
    if (!lastLine) {
      return { ok: false, text: '', error: 'Empty PaddleOCR stdout' };
    }
    const parsed = JSON.parse(lastLine) as {
      ok?: boolean;
      text?: string;
      error?: string;
    };
    if (!parsed.ok) {
      return { ok: false, text: '', error: parsed.error || 'PaddleOCR failed' };
    }
    return { ok: true, text: (parsed.text ?? '').trim() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`PaddleOCR unavailable: ${message}`);
    return { ok: false, text: '', error: message };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
