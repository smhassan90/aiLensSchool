import { Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { readEnv } from '../common/env';
import {
  getOcrDiagnosticSession,
  recordTextBoundary,
  recordWorkerBoundary,
} from './ocr-diagnostic';
import { sha256Buffer } from './ocr-diagnostic/hash';

const logger = new Logger('Pix2TextMathRunner');

export type Pix2TextCropResult = {
  id: string;
  ok: boolean;
  text: string;
  ms: number;
  error?: string | null;
};

export type Pix2TextBatchResult = {
  ok: boolean;
  results: Pix2TextCropResult[];
  version?: string;
  loadMs?: number;
  error?: string;
};

function workerScriptPath(): string {
  const candidates = [
    join(process.cwd(), 'ocr', 'pix2text_math_worker.py'),
    join(__dirname, '..', '..', 'ocr', 'pix2text_math_worker.py'),
    join(process.cwd(), 'backend', 'ocr', 'pix2text_math_worker.py'),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0];
}

function pythonBinary(): string {
  return (
    readEnv('PIX2TEXT_PYTHON') ||
    readEnv('PADDLE_OCR_PYTHON') ||
    readEnv('PYTHON') ||
    (process.platform === 'win32' ? 'python' : 'python3')
  );
}

export function pix2textMathCropsEnabled(): boolean {
  return readEnv('OCR_PIX2TEXT_MATH_CROPS') === '1';
}

export function pix2textMaxRegionsPerPage(): number {
  const n = Number(readEnv('OCR_PIX2TEXT_MAX_REGIONS') ?? 2);
  return Math.min(4, Math.max(0, Number.isFinite(n) ? n : 2));
}

export function pix2textMaxCropDimensionPx(): number {
  const n = Number(readEnv('OCR_PIX2TEXT_MAX_CROP_PX') ?? 1400);
  return Math.min(2400, Math.max(200, Number.isFinite(n) ? n : 1400));
}

export function pix2textTimeoutMs(): number {
  const n = Number(readEnv('OCR_PIX2TEXT_TIMEOUT_MS') ?? 120000);
  return Math.min(300000, Math.max(5000, Number.isFinite(n) ? n : 120000));
}

/**
 * Run Pix2Text on one or more JPEG crops in a single worker process (one model load).
 */
export async function runPix2TextOnCrops(
  crops: Array<{ id: string; buffer: Buffer }>,
): Promise<Pix2TextBatchResult> {
  if (!crops.length) {
    return { ok: true, results: [] };
  }

  const timeoutMs = pix2textTimeoutMs();
  const dir = await mkdtemp(join(tmpdir(), 'ailens-pix2text-'));
  const script = readEnv('PIX2TEXT_MATH_WORKER') || workerScriptPath();
  const batch: { crops: Array<{ id: string; path: string }> } = { crops: [] };

  try {
    for (const c of crops) {
      const path = join(dir, `${c.id}.jpg`);
      await writeFile(path, c.buffer);
      batch.crops.push({ id: c.id, path });
      recordWorkerBoundary(getOcrDiagnosticSession(), {
        stage: 'pix2text_crop_input',
        engine: 'pix2text',
        inputImageSha256: sha256Buffer(c.buffer),
        extra: { cropId: c.id, bytes: c.buffer.length },
      });
    }
    const batchPath = join(dir, 'batch.json');
    await writeFile(batchPath, JSON.stringify(batch), 'utf-8');

    const args = [script, '--batch-json', batchPath];
    const py = pythonBinary();
    const workerInvokeStart = Date.now();
    recordWorkerBoundary(getOcrDiagnosticSession(), {
      stage: 'pix2text_worker_invoke',
      engine: 'pix2text',
      pythonPath: py,
      extra: { cropCount: crops.length, script, args: [script, '--batch-json', '<batch>'] },
    });
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(py, args, {
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
        windowsHide: true,
      });
      let out = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Pix2Text timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      child.stdout.on('data', (chunk: Buffer) => {
        out += chunk.toString('utf8');
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
        const timedOut = false;
        const workerWallMs = Date.now() - workerInvokeStart;
        recordWorkerBoundary(getOcrDiagnosticSession(), {
          stage: 'pix2text_worker_close',
          engine: 'pix2text',
          exitCode: code ?? undefined,
          stderrSnippet: stderr.slice(0, 500),
          stdoutChars: out.length,
          timeout: timedOut,
          pythonPath: py,
          extra: {
            cropCount: crops.length,
            script,
            workerWallMs,
            stderrChars: stderr.length,
          },
        });
        recordTextBoundary(
          getOcrDiagnosticSession(),
          'pix2text_worker_stdout_raw',
          out,
          'pix2text',
        );
        if (code !== 0 && !out.trim()) {
          reject(new Error(stderr.trim() || `Pix2Text exited ${code ?? 'unknown'}`));
          return;
        }
        resolve(out.trim());
      });
    });

    const line = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .pop();
    if (!line) {
      return { ok: false, results: [], error: 'empty_stdout' };
    }
    let parsed: {
      ok?: boolean;
      results?: Pix2TextCropResult[];
      error?: string;
      version?: string;
      loadMs?: number;
    };
    try {
      parsed = JSON.parse(line) as typeof parsed;
    } catch (parseErr) {
      recordWorkerBoundary(getOcrDiagnosticSession(), {
        stage: 'pix2text_parse',
        engine: 'pix2text',
        parseError: 'malformed_json',
        stdoutChars: line.length,
      });
      return { ok: false, results: [], error: 'malformed_json' };
    }
    recordWorkerBoundary(getOcrDiagnosticSession(), {
      stage: 'pix2text_worker_parsed',
      engine: 'pix2text',
      extra: {
        ok: parsed.ok,
        version: parsed.version,
        loadMs: parsed.loadMs,
        resultCount: parsed.results?.length ?? 0,
        perCropMs: (parsed.results ?? []).map((r) => ({ id: r.id, ms: r.ms, ok: r.ok })),
      },
    });
    if (!parsed.ok) {
      return {
        ok: false,
        results: parsed.results ?? [],
        error: parsed.error || 'pix2text_failed',
        version: parsed.version,
        loadMs: parsed.loadMs,
      };
    }
    for (const row of parsed.results ?? []) {
      recordTextBoundary(
        getOcrDiagnosticSession(),
        `pix2text_raw_${row.id}`,
        row.text ?? '',
        'pix2text',
      );
    }
    return {
      ok: true,
      results: parsed.results ?? [],
      version: parsed.version,
      loadMs: parsed.loadMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Pix2Text unavailable: ${message.slice(0, 200)}`);
    return { ok: false, results: [], error: message };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
