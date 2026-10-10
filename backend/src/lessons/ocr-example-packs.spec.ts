import * as path from 'path';
import { mergePaddleAndTesseractPageOcr } from './merge-paddle-tesseract-ocr';
import { filterPageTextForLessonAssembly } from './page-text-sanitize';
import {
  buildScienceOcrFewShotBlock,
  loadAllOcrExamplePacks,
  resolveOcrExamplesRoot,
} from './ocr-example-packs';

describe('ocr example packs (durable training fixtures)', () => {
  const packs = loadAllOcrExamplePacks();

  it('loads Dignity + Unit 10 Physics packs', () => {
    expect(resolveOcrExamplesRoot()).toContain('ocr-examples');
    const ids = packs.map((p) => p.meta.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'english-dignity-page1',
        'physics-numericals-section-c',
        'physics-weblinks-waves',
        'physics-intro-waves',
        'physics-shm-pendulum',
        'physics-summary',
        'physics-concept-map-mcq',
        'physics-worked-example',
        'physics-math-symbols',
      ]),
    );
    expect(ids.length).toBeGreaterThanOrEqual(9);
  });

  it.each(packs.map((p) => [p.meta.id, p] as const))(
    'pack %s merges toward expected cues',
    (_id, pack) => {
      const merged = filterPageTextForLessonAssembly(
        mergePaddleAndTesseractPageOcr(pack.paddle, pack.tesseract),
      );
      for (const cue of pack.meta.mustMatch) {
        expect(merged).toMatch(new RegExp(cue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
      }
      for (const bad of pack.meta.mustNotMatch ?? []) {
        expect(merged).not.toMatch(new RegExp(bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
      }
      if (pack.meta.id === 'english-dignity-page1') {
        expect(merged.length).toBeGreaterThan(pack.paddle.length);
      }
    },
  );

  it('builds science few-shot block from physics packs only', () => {
    const block = buildScienceOcrFewShotBlock(packs, 2);
    expect(block).toMatch(/Science\/(?:numericals|physics) textbook OCR/i);
    expect(block).toMatch(/physics-/);
    expect(block).not.toMatch(/english-dignity-page1/);
    expect(path.basename(packs[0].dir)).toBeTruthy();
  });
});
