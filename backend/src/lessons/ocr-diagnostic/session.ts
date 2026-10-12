import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import {
  captureOcrFeatureFlags,
  isOcrDiagnosticEnabled,
  isOcrDiagnosticTestCaseAllowed,
  ocrDiagnosticRootDir,
} from './config';
import type { OcrDiagnosticSession } from './context';
import { newCorrelationId, recordOcrDiagnosticEvent } from './context';
import {
  diagnosticSaveImage,
  diagnosticSaveText,
  finalizeDiagnosticManifest,
  imageMeta,
} from './artifacts';
import { sha256Buffer } from './hash';

export type BeginOcrDiagnosticInput = {
  correlationId?: string;
  testCaseId?: string;
};

export function beginOcrDiagnosticSession(input: BeginOcrDiagnosticInput): OcrDiagnosticSession | null {
  if (!isOcrDiagnosticEnabled()) return null;
  if (!isOcrDiagnosticTestCaseAllowed(input.testCaseId)) {
    return null;
  }
  const correlationId = input.correlationId?.trim() || newCorrelationId();
  const root = ocrDiagnosticRootDir();
  const artifactDir = join(root, correlationId);
  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true });
  }
  const session: OcrDiagnosticSession = {
    correlationId,
    testCaseId: input.testCaseId,
    startedAt: Date.now(),
    artifactDir,
    bytesWritten: 0,
    featureFlags: captureOcrFeatureFlags(),
    events: [],
    manifest: {
      correlationId,
      testCaseId: input.testCaseId,
      startedAt: '',
      images: [],
      texts: [],
    },
  };
  recordOcrDiagnosticEvent({
    stage: 'diagnostic_session_start',
    extra: { testCaseId: input.testCaseId, artifactDir },
  });
  return session;
}

export async function recordImageBoundary(
  session: OcrDiagnosticSession | null | undefined,
  stage: string,
  buf: Buffer,
  cropBox?: { x0: number; y0: number; x1: number; y1: number },
): Promise<void> {
  if (!session || !buf?.length) return;
  const meta = await imageMeta(buf);
  const saved = diagnosticSaveImage(session, stage, buf, cropBox, meta);
  recordOcrDiagnosticEvent({
    stage,
    inputImageSha256: saved.sha256,
    extra: {
      width: meta.width,
      height: meta.height,
      format: meta.format,
      orientation: meta.orientation,
      bytes: buf.length,
      artifactSkipped: saved.skipped ?? false,
      cropBox,
    },
  });
}

export function recordTextBoundary(
  session: OcrDiagnosticSession | null | undefined,
  stage: string,
  text: string,
  engine?: string,
): void {
  if (!session) return;
  const body = text ?? '';
  const saved = diagnosticSaveText(session, stage, body);
  recordOcrDiagnosticEvent({
    stage,
    engine,
    outputTextSha256: saved.sha256,
    outputCharCount: body.length,
    outputEmpty: !body.trim(),
  });
}

export function recordWorkerBoundary(
  session: OcrDiagnosticSession | null | undefined,
  input: {
    stage: string;
    engine: string;
    inputImageSha256?: string;
    exitCode?: number;
    stderrSnippet?: string;
    stdoutChars?: number;
    parseError?: string;
    timeout?: boolean;
    pythonPath?: string;
    extra?: Record<string, unknown>;
  },
): void {
  if (!session) return;
  let errorCategory: string | undefined;
  if (input.timeout) errorCategory = 'timeout';
  else if (input.parseError) errorCategory = 'parse_error';
  else if (input.exitCode !== undefined && input.exitCode !== 0) errorCategory = 'nonzero_exit';
  recordOcrDiagnosticEvent({
    stage: input.stage,
    engine: input.engine,
    inputImageSha256: input.inputImageSha256,
    exitCode: input.exitCode,
    errorCategory,
    errorDetail: input.parseError || input.stderrSnippet?.slice(0, 500),
    extra: {
      stdoutChars: input.stdoutChars,
      pythonPath: input.pythonPath,
      ...input.extra,
    },
  });
}

export function endOcrDiagnosticSession(session: OcrDiagnosticSession | null | undefined): string | null {
  if (!session) return null;
  recordOcrDiagnosticEvent({
    stage: 'diagnostic_session_end',
    elapsedMs: Date.now() - session.startedAt,
  });
  return finalizeDiagnosticManifest(session);
}

/** Compare two buffers; log mismatch without altering processing. */
export function assertSameBytes(
  session: OcrDiagnosticSession | null | undefined,
  stage: string,
  a: Buffer,
  b: Buffer,
  labelA: string,
  labelB: string,
): boolean {
  const match = a.length === b.length && sha256Buffer(a) === sha256Buffer(b);
  if (session) {
    recordOcrDiagnosticEvent({
      stage,
      extra: {
        labelA,
        labelB,
        match,
        sha256A: sha256Buffer(a),
        sha256B: sha256Buffer(b),
        lenA: a.length,
        lenB: b.length,
      },
    });
  }
  return match;
}
