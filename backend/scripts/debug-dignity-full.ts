import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  orientationCandidates,
  prepareOrientedVariant,
} from '../src/lessons/page-image-prep';
import { PageOcrService } from '../src/lessons/page-ocr.service';
import {
  compareOrientationOcrResults,
  filterPageTextForLessonAssembly,
  mergeDualChannelPageOcr,
  scorePageOcrCandidate,
  scorePageOcrQuality,
  isPagePhotoTextReadable,
  englishPageTranscriptLooksIncomplete,
} from '../src/lessons/page-text-sanitize';

const EXPECTED = {
  '01': [/Pre-reading/i, /Dignity of Work/i, /Akhtar came home/i, /social service week/i, /sweeper do it/i],
  '02': [/sweeper not a human/i, /Holy Prophet/i, /Khandaq|Khandag/i, /Abu Bakar|Abu Bakr/i, /Hazrat Omar/i],
  '03': [/business tycoon/i, /China/i, /deliver newspapers/i, /menial or low/i, /motto of my life/i],
  '04': [/Exercise 1/i, /central idea/i, /respect for all people who work/i, /Exercise 2/i, /\bcross\b/i, /tycoon/i],
  '05': [/Exercise 3/i, /Fetched water/i, /Exercise 4/i, /Khandaq|Khandag/i, /upset.*angry/i],
  '06': [/Exercise 5/i, /true or false/i, /headmaster.*bathroom/i, /Exercise 6/i, /Why was Akhtar cross/i],
  '07': [/Exercise 7/i, /dignity of work/i, /support staff/i, /Note for teachers/i],
};

async function getSharp() {
  const m = await import('sharp');
  return (m as any).default ?? m;
}

async function bestOcrForFile(
  ocr: PageOcrService,
  filePath: string,
): Promise<{ text: string; deg: number; score: number }> {
  const buffer = readFileSync(filePath);
  const file = {
    buffer,
    mimetype: 'image/jpeg',
    originalname: 'page.jpg',
    size: buffer.length,
  } as Express.Multer.File;
  const sharpFn = await getSharp();
  const afterExif = await sharpFn(buffer).rotate().toBuffer({ resolveWithObject: true });
  const degrees = orientationCandidates(afterExif.info.width, afterExif.info.height);
  let best: { text: string; degrees: number; score: number; readable: boolean } | null = null;
  for (const deg of degrees) {
    const variant = await prepareOrientedVariant(file, deg);
    const grey = {
      ...file,
      buffer: variant.ocr.buffer,
      mimetype: 'image/jpeg',
      size: variant.ocr.size,
    } as Express.Multer.File;
    const color = {
      ...file,
      buffer: variant.vision.buffer,
      mimetype: 'image/jpeg',
      size: variant.vision.size,
    } as Express.Multer.File;
    const [[rawGrey], [rawColor]] = await Promise.all([
      ocr.readPageTexts([grey], { subjectName: 'English' }),
      ocr.readPageTexts([color], { subjectName: 'English' }),
    ]);
    const text = mergeDualChannelPageOcr(rawGrey ?? '', rawColor ?? '');
    const score = scorePageOcrCandidate(text);
    const readable =
      isPagePhotoTextReadable(text) && !englishPageTranscriptLooksIncomplete(text);
    const candidate = { text, degrees: deg, score, readable };
    if (compareOrientationOcrResults(best ?? undefined, candidate) > 0) {
      best = candidate;
    }
  }
  return { text: best!.text, deg: best!.degrees, score: best!.score };
}

async function main() {
  process.env.OCR_ENGINE = 'tesseract';
  const dir = join(__dirname, '../test-fixtures/dignity-of-work');
  const files = readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
  const ocr = new PageOcrService();
  const pages: string[] = [];
  let totalMissing = 0;

  for (const name of files) {
    const key = name.replace('.jpg', '');
    const result = await bestOcrForFile(ocr, join(dir, name));
    const filtered = filterPageTextForLessonAssembly(result.text);
    const cues = EXPECTED[key as keyof typeof EXPECTED] ?? [];
    const miss = cues.filter((re) => !re.test(filtered));
    totalMissing += miss.length;
    console.log(`\n======== PAGE ${name} deg=${result.deg} len=${result.text.length} filtered=${filtered.length} ========`);
    console.log(`cues ${cues.length - miss.length}/${cues.length} missing:`, miss.map((r) => r.source));
    console.log('lost in filter:', cues.filter((re) => re.test(result.text) && !re.test(filtered)).map((r) => r.source));
    pages.push(filtered);
  }

  const combined = pages.join('\n\n');
  writeFileSync(join(dir, 'combined-filtered.txt'), combined);
  console.log('\n======== COMBINED ========');
  for (const [key, cues] of Object.entries(EXPECTED)) {
    for (const re of cues) {
      if (!re.test(combined)) {
        console.log(`MISSING ${key}:`, re.source);
        totalMissing += 1;
      }
    }
  }
  console.log('totalMissingCues', totalMissing);
  await ocr.onModuleDestroy();
  process.exit(totalMissing > 8 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
