import { readEnv } from '../../common/env';
import { paddleOcrEnabled, ocrEngineMode } from '../paddle-ocr.runner';
import { pix2textMathCropsEnabled } from '../pix2text-math.runner';
import { mathRegionRecoveryEnabled } from '../ocr-math-region-recovery';

export type OcrFeatureFlagSnapshot = {
  capturedAt: string;
  buildSha: string;
  flags: Record<
    string,
    {
      raw: string | null;
      effective: string | boolean | number;
      source: 'env' | 'derived';
    }
  >;
};

export function isOcrDiagnosticEnabled(): boolean {
  return readEnv('OCR_DIAGNOSTIC') === '1';
}

/** When set (comma-separated), diagnostic sessions require a matching testCaseId. */
export function ocrDiagnosticAllowedTestIds(): string[] | null {
  const raw = readEnv('OCR_DIAGNOSTIC_ALLOWED_TEST_IDS');
  if (!raw?.trim()) return null;
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length ? ids : null;
}

export function isOcrDiagnosticTestCaseAllowed(testCaseId?: string): boolean {
  if (!isOcrDiagnosticEnabled()) return false;
  const allowed = ocrDiagnosticAllowedTestIds();
  if (!allowed) return true;
  if (!testCaseId?.trim()) return false;
  return allowed.includes(testCaseId.trim());
}

export function ocrDiagnosticRootDir(): string {
  return readEnv('OCR_DIAGNOSTIC_DIR') || 'var/ocr-diagnostic';
}

export function ocrDiagnosticMaxBytesPerSession(): number {
  const n = Number(readEnv('OCR_DIAGNOSTIC_MAX_BYTES') ?? 80_000_000);
  return Number.isFinite(n) ? Math.max(1_000_000, n) : 80_000_000;
}

export function captureOcrFeatureFlags(): OcrFeatureFlagSnapshot {
  const flag = (name: string, effective: string | boolean | number, source: 'env' | 'derived' = 'env') => ({
    raw: readEnv(name) ?? null,
    effective,
    source,
  });
  return {
    capturedAt: new Date().toISOString(),
    buildSha: readEnv('BUILD_SHA') ?? 'unknown',
    flags: {
      OCR_ENGINE: flag('OCR_ENGINE', ocrEngineMode()),
      OCR_MATH_REGION_RETRY: flag('OCR_MATH_REGION_RETRY', mathRegionRecoveryEnabled(), 'derived'),
      OCR_PIX2TEXT_MATH_CROPS: flag('OCR_PIX2TEXT_MATH_CROPS', pix2textMathCropsEnabled(), 'derived'),
      OCR_AI_MERGE: flag('OCR_AI_MERGE', readEnv('OCR_AI_MERGE') ?? '(default-on-when-keys)'),
      OCR_MERGE_VISION: flag('OCR_MERGE_VISION', readEnv('OCR_MERGE_VISION') ?? '0'),
      PADDLE_OCR_ENABLED: flag('PADDLE_OCR_ENABLED', paddleOcrEnabled(), 'derived'),
      PIX2TEXT_PYTHON: flag('PIX2TEXT_PYTHON', readEnv('PIX2TEXT_PYTHON') ? '(set)' : '(unset)'),
      PADDLE_OCR_PYTHON: flag('PADDLE_OCR_PYTHON', readEnv('PADDLE_OCR_PYTHON') ? '(set)' : '(unset)'),
    },
  };
}
