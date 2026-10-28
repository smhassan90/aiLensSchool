/** Apply library chapter teaching pack tables (idempotent). */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function main() {
  const sqlPath = join(
    __dirname,
    '../prisma/migrations/20261029120000_library_chapter_teaching_pack/migration.sql',
  );
  const sql = readFileSync(sqlPath, 'utf8');
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (const statement of statements) {
    try {
      await prisma.$executeRawUnsafe(`${statement};`);
      console.log('OK:', statement.slice(0, 60).replace(/\s+/g, ' '));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('already exists') || msg.includes('Duplicate')) {
        console.log('SKIP (exists):', statement.slice(0, 50));
      } else {
        throw error;
      }
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
