/**
 * Live portal-style OCR verify for physics math symbols across Unit 10 pages.
 * Usage (inside backend container):
 *   node scripts/verify-physics-symbols-live.cjs [image1] [image2] ...
 * Default images: /tmp/physics-shm-page.jpg /tmp/physics-wave-page.jpg /tmp/physics-numericals-page.jpg
 */
const fs = require('fs');
const path = require('path');

function checksFor(label, merged) {
  const base = {
    sinTheta: /sin\s*θ/i.test(merged) || /mg sin θ/i.test(merged),
    cosTheta: /cos\s*θ/i.test(merged) || /mg cos θ/i.test(merged),
    pi: /π/.test(merged),
    piApprox: /π\s*≅|π\s*≈|22\s*\/\s*7/.test(merged),
    piSq: /π²|π\^2/.test(merged),
    sqrtPeriod: /2π√|T\s*=\s*2π√\(L\/g\)/.test(merged),
    frequencyF: /\bf\s*=\s*1\s*\/\s*T|\bf\s*=\s*1\s*\/\s*\d|\bfrequency\b/i.test(merged),
    infinity: /∞/.test(merged),
    lambda: /λ/.test(merged),
    halfFraction: /1\s*\/\s*2|A\s*=\s*1\/2/.test(merged),
  };

  // Page-specific critical checks (symbols that must appear on that page)
  let critical = [];
  if (/shm|pendulum/i.test(label)) {
    critical = ['sinTheta', 'cosTheta', 'sqrtPeriod'];
  } else if (/wave/i.test(label)) {
    critical = ['frequencyF', 'lambda'];
  } else if (/numerical/i.test(label)) {
    critical = ['frequencyF'];
  } else {
    critical = ['sinTheta', 'cosTheta', 'sqrtPeriod', 'frequencyF'];
  }
  return { base, critical };
}

async function ocrOne(ocr, imagePath) {
  const { mergePaddleAndTesseractPageOcr } = require('../dist/lessons/merge-paddle-tesseract-ocr');
  const { filterPageTextForLessonAssembly } = require('../dist/lessons/page-text-sanitize');

  const buffer = fs.readFileSync(imagePath);
  const file = {
    buffer,
    mimetype: 'image/jpeg',
    originalname: path.basename(imagePath),
    size: buffer.length,
  };
  const [{ paddle, tesseract }] = await ocr.readPageOcrEnginesParallel([file], {
    subjectName: 'Physics',
  });
  const merged = filterPageTextForLessonAssembly(
    mergePaddleAndTesseractPageOcr(paddle || '', tesseract || ''),
  );
  const label = path.basename(imagePath);
  const { base, critical } = checksFor(label, merged);
  const failed = critical.filter((k) => !base[k]);
  return {
    image: label,
    paddleChars: (paddle || '').length,
    tesseractChars: (tesseract || '').length,
    mergedChars: merged.length,
    checks: base,
    critical,
    failed,
    mergedPreview: merged.slice(0, 2200),
  };
}

async function main() {
  const defaults = [
    '/tmp/physics-shm-page.jpg',
    '/tmp/physics-wave-page.jpg',
    '/tmp/physics-numericals-page.jpg',
  ];
  const images = (process.argv.slice(2).length ? process.argv.slice(2) : defaults).filter((p) =>
    fs.existsSync(p),
  );
  if (!images.length) {
    console.error('Usage: node verify-physics-symbols-live.cjs <image>...');
    process.exit(2);
  }

  const { PageOcrService } = require('../dist/lessons/page-ocr.service');
  const ocr = new PageOcrService();
  const results = [];
  for (const img of images) {
    results.push(await ocrOne(ocr, img));
  }
  await ocr.onModuleDestroy?.();

  const out = {
    pages: results.map((r) => ({
      image: r.image,
      paddleChars: r.paddleChars,
      tesseractChars: r.tesseractChars,
      mergedChars: r.mergedChars,
      checks: r.checks,
      critical: r.critical,
      failed: r.failed,
      mergedPreview: r.mergedPreview,
    })),
    allCriticalPassed: results.every((r) => r.failed.length === 0),
  };
  console.log(JSON.stringify(out, null, 2));
  if (!out.allCriticalPassed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
