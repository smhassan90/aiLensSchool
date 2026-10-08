import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  orientationCandidates,
  prepareOrientedVariant,
} from '../src/lessons/page-image-prep';
import { PageOcrService } from '../src/lessons/page-ocr.service';
import {
  filterPageTextForLessonAssembly,
  pickBetterPageTranscript,
  scorePageOcrCandidate,
  scorePageOcrQuality,
  isPagePhotoTextReadable,
} from '../src/lessons/page-text-sanitize';
import { repairCompiledChapterFromSource } from '../src/lessons/chapter-compile-repair';

const EXPECTED = {
  '01': [/flung\s+h?\s*imself/i, /beginning to sink/i, /Eliza Cook|Eliza Coole/i, /Pre-reading/i, /afraid of it/i],
  '02': [
    /great deed/i,
    /quite sad/i,
    /low despair/i,
    /give it all up/i,
    /silken filmy/i,
    /ceiling dome/i,
    /cobweb home/i,
    /slipping sprawl/i,
    /least complaint/i,
    /half-yard higher/i,
  ],
  '03': [
    /Nine brave attempts/i,
    /foolish thing/i,
    /anxious minute/i,
    /cobweb door/i,
    /native cot/i,
    /Bravo/i,
    /why should not I/i,
    /time did not fail/i,
  ],
  '04': [/Exercise 1/i, /Exercise 2/i, /Was the king happy/i],
  '05': [/Exercise 3/i, /Exercise 4/i, /poem is about a war/i, /lose hope/i],
  '06': [/Exercise 5/i, /Exercise 6/i, /Why was King Bruce so sad/i, /\bnine\b/i],
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
  let best: { text: string; deg: number; score: number } | null = null;
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
    const text = pickBetterPageTranscript(rawGrey ?? '', rawColor ?? '');
    const score = scorePageOcrCandidate(text);
    if (!best || score > best.score) best = { text, deg, score };
    // Always try all orientations for these fixtures (poem pages need the best ending).
  }
  return best!;
}

async function main() {
  process.env.OCR_ENGINE = 'tesseract';
  const dir = join(__dirname, '../test-fixtures/king-bruce-pages');
  const files = readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
  const ocr = new PageOcrService();
  const pages: string[] = [];

  for (const name of files) {
    const key = name.replace('.jpg', '');
    const result = await bestOcrForFile(ocr, join(dir, name));
    const filtered = filterPageTextForLessonAssembly(result.text);
    const cues = EXPECTED[key as keyof typeof EXPECTED] ?? [];
    const hits = cues.filter((re) => re.test(result.text));
    const miss = cues.filter((re) => !re.test(result.text));
    console.log(`\n======== PAGE ${name} deg=${result.deg} score=${result.score} len=${result.text.length} ========`);
    console.log(`readable=${isPagePhotoTextReadable(result.text)} quality=${scorePageOcrQuality(result.text)}`);
    console.log(`cues ${hits.length}/${cues.length} missing:`, miss.map((r) => r.source));
    console.log('--- RAW ---\n', result.text);
    console.log('--- FILTERED missing sink/stanza? ---');
    console.log('filtered len', filtered.length, 'lost cues', cues.filter((re) => re.test(result.text) && !re.test(filtered)).map((r) => r.source));
    pages.push(filtered);
  }

  const rawCombined = pages.join('\n\n');
  writeFileSync(join(dir, 'combined-raw.txt'), rawCombined);
  // Simulate a bad model compile (truncated body, empty exercises) then repair from source.
  const badBody = rawCombined.slice(0, 450);
  const repaired = repairCompiledChapterFromSource(rawCombined, badBody, '');
  writeFileSync(join(dir, 'repaired-compile.txt'), `BODY\n${repaired.lessonBody}\n\nEXERCISES\n${repaired.exercises}`);
  console.log('\n======== COMBINED CUE CHECK (filtered assembly) ========');
  const allCues = Object.values(EXPECTED).flat();
  let missing = 0;
  for (const re of allCues) {
    if (!re.test(rawCombined)) {
      console.log('MISSING IN COMBINED:', re.source);
      missing += 1;
    }
  }
  console.log(`combined len=${rawCombined.length} missingCues=${missing}`);
  console.log('\n======== REPAIRED COMPILE CUE CHECK ========');
  const repairedAll = `${repaired.lessonBody}\n\n${repaired.exercises}`;
  let missRepair = 0;
  for (const re of allCues) {
    if (!re.test(repairedAll)) {
      console.log('MISSING IN REPAIRED:', re.source);
      missRepair += 1;
    }
  }
  const exHits = [1, 2, 3, 4, 5, 6].filter((n) => new RegExp(`Exercise\\s*${n}\\b`, 'i').test(repaired.exercises));
  console.log(`repaired body=${repaired.lessonBody.length} exercises=${repaired.exercises.length} missingCues=${missRepair} exercisesPresent=${exHits.join(',')}`);
  await ocr.onModuleDestroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
