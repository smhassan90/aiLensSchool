/**
 * List library chapters granted to TPS (or --school=code) and generate teaching packs via AI.
 *
 * List only:
 *   npx ts-node --transpile-only -r dotenv/config scripts/generate-tps-chapter-teaching-packs.ts --list
 *
 * Generate (skip packs whose content hash unchanged):
 *   npx ts-node --transpile-only -r dotenv/config scripts/generate-tps-chapter-teaching-packs.ts
 *
 * Force regenerate all:
 *   npx ts-node --transpile-only -r dotenv/config scripts/generate-tps-chapter-teaching-packs.ts --force
 *
 * Limit for testing:
 *   ... --limit=5
 */
import { PrismaClient } from '@prisma/client';
import { joinCompiledChapter } from '../src/ai/schemas/chapter-compile.schema';
import { plannerChapterContentHash, plannerChapterContentStatus } from '../src/academic-planner/planner-content.util';
import {
  CHAPTER_TEACHING_PACK_PROMPT_VERSION,
  generateChapterTeachingPack,
} from '../src/library-books/chapter-teaching-pack.generator';
import {
  listGrantedChaptersForSchool,
  upsertChapterTeachingPack,
} from '../src/library-books/chapter-teaching-pack.persistence';

const prisma = new PrismaClient();

function argValue(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

async function resolveSchoolId(): Promise<{ id: string; code: string; name: string }> {
  const code = (argValue('school') ?? process.env.TPS_SCHOOL_CODE ?? 'tps').trim().toLowerCase();
  const school = await prisma.school.findFirst({
    where: { code },
    select: { id: true, code: true, name: true },
  });
  if (!school) {
    throw new Error(`School not found for code "${code}". Set --school=code or TPS_SCHOOL_CODE.`);
  }
  return school;
}

async function main() {
  const listOnly = process.argv.includes('--list');
  const force = process.argv.includes('--force');
  const limit = Number(argValue('limit') ?? '0') || undefined;

  const school = await resolveSchoolId();
  const chapters = await listGrantedChaptersForSchool(prisma, school.id);

  console.log(`School: ${school.name} (${school.code}) — ${chapters.length} granted library chapter(s)\n`);

  if (listOnly) {
    for (const ch of chapters) {
      const text = joinCompiledChapter(ch.publishedText, ch.exercisesText).trim();
      const status = plannerChapterContentStatus(ch.publishedText, ch.exercisesText);
      const pack = ch.teachingPack;
      console.log(
        [
          status.padEnd(10),
          pack ? `pack:${pack.source}` : 'no-pack',
          `${text.length} chars`.padStart(10),
          ch.book.classLabel,
          ch.book.subjectLabel,
          ch.title.slice(0, 60),
          ch.id,
        ].join(' | '),
      );
    }
    return;
  }

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const ch of chapters) {
    if (limit != null && processed >= limit) break;

    const status = plannerChapterContentStatus(ch.publishedText, ch.exercisesText);
    if (status === 'MISSING') {
      console.log(`SKIP (no content): ${ch.title}`);
      skipped++;
      continue;
    }

    const contentHash = plannerChapterContentHash(ch.publishedText, ch.exercisesText);
    if (!force && ch.teachingPack?.contentHash === contentHash) {
      console.log(`SKIP (up to date): ${ch.title}`);
      skipped++;
      continue;
    }

    const chapterText = joinCompiledChapter(ch.publishedText, ch.exercisesText).trim();
    console.log(`GENERATE: ${ch.book.classLabel} · ${ch.book.subjectLabel} · ${ch.title}`);

    try {
      const result = await generateChapterTeachingPack({
        chapterTitle: ch.title,
        chapterText,
        subjectName: ch.book.subjectLabel,
        classLabel: ch.book.classLabel,
        bookTitle: ch.book.title,
      });

      await upsertChapterTeachingPack(prisma, {
        libraryBookChapterId: ch.id,
        contentHash,
        pack: result.pack,
        source: result.source,
        warnings: result.warnings.length ? result.warnings : null,
        promptVersion: CHAPTER_TEACHING_PACK_PROMPT_VERSION,
      });

      console.log(
        `  → saved (${result.source}, ${result.pack.readingSlices.length} slices, ${result.pack.questions.length} Q, provider=${result.provider})`,
      );
      if (result.warnings.length) {
        for (const w of result.warnings) console.log(`  warn: ${w.code}: ${w.message.slice(0, 120)}`);
      }
      processed++;
    } catch (error) {
      failed++;
      console.error(`  FAILED: ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log(`\nDone. generated=${processed} skipped=${skipped} failed=${failed}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
