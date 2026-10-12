const { createRequire } = require('module');
const { existsSync } = require('fs');
const { join } = require('path');

const requireFromApp = createRequire(join(process.cwd(), 'package.json'));

function requireOcrDiagnosticModule(basename) {
  const distPath = join(process.cwd(), 'dist', 'lessons', 'ocr-diagnostic', basename);
  const srcPath = join(process.cwd(), 'src', 'lessons', 'ocr-diagnostic', basename);
  if (existsSync(`${distPath}.js`)) {
    return requireFromApp(distPath);
  }
  if (existsSync(`${srcPath}.ts`) || existsSync(`${srcPath}.js`)) {
    return requireFromApp(srcPath);
  }
  throw new Error(`OCR diagnostic module not found: ${basename} (cwd=${process.cwd()})`);
}

module.exports = { requireOcrDiagnosticModule };
