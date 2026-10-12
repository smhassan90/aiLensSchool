import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { OcrDiagnosticSession } from './context';
import { sha256Buffer, sha256Text } from './hash';
import { ocrDiagnosticMaxBytesPerSession } from './config';

export async function imageMeta(buf: Buffer): Promise<{
  width?: number;
  height?: number;
  format?: string;
  orientation?: number;
}> {
  try {
    const sharpModule = await import('sharp');
    const sharp =
      (sharpModule as { default?: (i: Buffer) => import('sharp').Sharp }).default ??
      (sharpModule as unknown as (i: Buffer) => import('sharp').Sharp);
    const meta = await sharp(buf).metadata();
    return {
      width: meta.width,
      height: meta.height,
      format: meta.format,
      orientation: meta.orientation,
    };
  } catch {
    return {};
  }
}

export function ensureDiagnosticDir(session: OcrDiagnosticSession): void {
  if (!existsSync(session.artifactDir)) {
    mkdirSync(session.artifactDir, { recursive: true });
  }
}

export function diagnosticSaveImage(
  session: OcrDiagnosticSession,
  stage: string,
  buf: Buffer,
  cropBox?: { x0: number; y0: number; x1: number; y1: number },
  meta?: { width?: number; height?: number },
): { sha256: string; path: string; skipped?: boolean } {
  const max = ocrDiagnosticMaxBytesPerSession();
  if (session.bytesWritten + buf.length > max) {
    return { sha256: sha256Buffer(buf), path: '', skipped: true };
  }
  ensureDiagnosticDir(session);
  const safe = stage.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
  const file = `${safe}.jpg`;
  const full = join(session.artifactDir, file);
  writeFileSync(full, buf);
  session.bytesWritten += buf.length;
  const hash = sha256Buffer(buf);
  session.manifest.images.push({
    stage,
    file,
    sha256: hash,
    width: meta?.width,
    height: meta?.height,
    cropBox,
  });
  return { sha256: hash, path: full };
}

export function diagnosticSaveText(
  session: OcrDiagnosticSession,
  stage: string,
  text: string,
  ext = 'txt',
): { sha256: string; path: string } {
  ensureDiagnosticDir(session);
  const safe = stage.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
  const file = `${safe}.${ext}`;
  const full = join(session.artifactDir, file);
  const body = text ?? '';
  writeFileSync(full, body, 'utf8');
  session.bytesWritten += Buffer.byteLength(body, 'utf8');
  const hash = sha256Text(body);
  session.manifest.texts.push({
    stage,
    file,
    sha256: hash,
    charCount: body.length,
  });
  return { sha256: hash, path: full };
}

export function finalizeDiagnosticManifest(session: OcrDiagnosticSession): string {
  ensureDiagnosticDir(session);
  session.manifest.startedAt = new Date(session.startedAt).toISOString();
  const manifestPath = join(session.artifactDir, 'manifest.json');
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        ...session.manifest,
        featureFlags: session.featureFlags,
        events: session.events,
        bytesWritten: session.bytesWritten,
        finishedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    'utf8',
  );
  writeFileSync(
    join(session.artifactDir, 'events.jsonl'),
    session.events.map((e) => JSON.stringify(e)).join('\n'),
    'utf8',
  );
  return manifestPath;
}
