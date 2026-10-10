/**
 * Dump raw paddle + tesseract OCR for an image (portal engines path).
 * Usage: node scripts/dump-raw-ocr.cjs /tmp/page.jpg
 */
const fs = require('fs');
const path = require('path');

async function main() {
  const imagePath = process.argv[2];
  if (!imagePath || !fs.existsSync(imagePath)) {
    console.error('Usage: node dump-raw-ocr.cjs <image>');
    process.exit(2);
  }

  const { PageOcrService } = require('../dist/lessons/page-ocr.service');
  const buffer = fs.readFileSync(imagePath);
  const file = {
    buffer,
    mimetype: 'image/jpeg',
    originalname: path.basename(imagePath),
    size: buffer.length,
  };

  const ocr = new PageOcrService();
  const [{ paddle, tesseract }] = await ocr.readPageOcrEnginesParallel([file], {
    subjectName: 'Physics',
  });
  console.log('===PADDLE===\n' + (paddle || ''));
  console.log('\n===TESSERACT===\n' + (tesseract || ''));
  await ocr.onModuleDestroy?.();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
