import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import type { OcrFeatureFlagSnapshot } from './config';

export type OcrDiagnosticStageEvent = {
  correlationId: string;
  testCaseId?: string;
  stage: string;
  ts: string;
  elapsedMs?: number;
  engine?: string;
  cropId?: string;
  inputImageSha256?: string;
  outputTextSha256?: string;
  outputCharCount?: number;
  outputEmpty?: boolean;
  exitCode?: number;
  errorCategory?: string;
  errorDetail?: string;
  fusionRule?: string;
  fusionDecision?: 'accept' | 'reject' | 'skip';
  branchEntered?: boolean;
  branchSkipReason?: string;
  extra?: Record<string, unknown>;
};

export type OcrDiagnosticSession = {
  correlationId: string;
  testCaseId?: string;
  startedAt: number;
  artifactDir: string;
  bytesWritten: number;
  featureFlags: OcrFeatureFlagSnapshot;
  events: OcrDiagnosticStageEvent[];
  manifest: {
    correlationId: string;
    testCaseId?: string;
    startedAt: string;
    images: Array<{
      stage: string;
      file: string;
      sha256: string;
      width?: number;
      height?: number;
      cropBox?: { x0: number; y0: number; x1: number; y1: number };
    }>;
    texts: Array<{
      stage: string;
      file: string;
      sha256: string;
      charCount: number;
    }>;
  };
};

const storage = new AsyncLocalStorage<OcrDiagnosticSession>();

export function getOcrDiagnosticSession(): OcrDiagnosticSession | undefined {
  return storage.getStore();
}

export function runWithOcrDiagnosticSession<T>(
  session: OcrDiagnosticSession,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(session, fn);
}

export function newCorrelationId(): string {
  return randomUUID();
}

export function recordOcrDiagnosticEvent(
  partial: Omit<OcrDiagnosticStageEvent, 'correlationId' | 'ts'> & { ts?: string },
): void {
  const session = storage.getStore();
  if (!session) return;
  const event: OcrDiagnosticStageEvent = {
    correlationId: session.correlationId,
    testCaseId: session.testCaseId,
    ts: partial.ts ?? new Date().toISOString(),
    stage: partial.stage,
    elapsedMs: partial.elapsedMs,
    engine: partial.engine,
    cropId: partial.cropId,
    inputImageSha256: partial.inputImageSha256,
    outputTextSha256: partial.outputTextSha256,
    outputCharCount: partial.outputCharCount,
    outputEmpty: partial.outputEmpty,
    exitCode: partial.exitCode,
    errorCategory: partial.errorCategory,
    errorDetail: partial.errorDetail,
    fusionRule: partial.fusionRule,
    fusionDecision: partial.fusionDecision,
    branchEntered: partial.branchEntered,
    branchSkipReason: partial.branchSkipReason,
    extra: partial.extra,
  };
  session.events.push(event);
}
