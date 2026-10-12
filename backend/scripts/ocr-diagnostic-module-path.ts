import { createRequire } from 'module';
import { existsSync } from 'fs';
import { join } from 'path';

const require = createRequire(import.meta.url);

/** Resolve compiled dist modules in production containers, or src when developing locally. */
export function requireOcrDiagnosticModule<T>(basename: string): T {
  const distPath = join(process.cwd(), 'dist', 'lessons', 'ocr-diagnostic', basename);
  const srcPath = join(process.cwd(), 'src', 'lessons', 'ocr-diagnostic', basename);
  if (existsSync(`${distPath}.js`)) {
    return require(distPath) as T;
  }
  if (existsSync(`${srcPath}.ts`) || existsSync(`${srcPath}.js`)) {
    return require(srcPath) as T;
  }
  throw new Error(`OCR diagnostic module not found: ${basename} (cwd=${process.cwd()})`);
}
