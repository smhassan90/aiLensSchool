import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

type LegacyRow = {
  id: string;
  school_id: string;
  school_name: string;
  chapter_name: string | null;
  topic_name: string | null;
  ai_summary: string | null;
  created_by_id: string;
  subject_name: string;
  grade_name: string;
};

@Injectable()
export class LibraryBooksService {
  constructor(private readonly prisma: PrismaService) {}

  async listForSuperAdmin(actorUserId: string) {
    await this.ensureTables();
    await this.importLegacyChapters(actorUserId);
    const books = await this.prisma.libraryBook.findMany({
      orderBy: [{ subjectLabel: 'asc' }, { classLabel: 'asc' }, { title: 'asc' }],
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        originSchool: { select: { id: true, name: true } },
        _count: { select: { chapters: true, grants: true } },
      },
    });
    return books.map((book) => ({
      id: book.id,
      title: book.title,
      publisher: book.publisher,
      classLabel: book.classLabel,
      subjectLabel: book.subjectLabel,
      editionYear: book.editionYear,
      chapterCount: book._count.chapters,
      schoolCount: book._count.grants,
      createdBy: book.createdBy,
      originSchool: book.originSchool,
      createdAt: book.createdAt,
    }));
  }

  async getForSuperAdmin(id: string) {
    await this.ensureTables();
    const book = await this.prisma.libraryBook.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        originSchool: { select: { id: true, name: true } },
        chapters: { orderBy: [{ chapterNumber: 'asc' }, { title: 'asc' }] },
        grants: { include: { school: { select: { id: true, name: true } } } },
      },
    });
    if (!book) {
      throw new NotFoundException({ code: 'BOOK_NOT_FOUND', message: 'Book not found' });
    }
    return {
      ...book,
      chapters: book.chapters.map((chapter) => ({
        id: chapter.id,
        chapterNumber: chapter.chapterNumber,
        title: chapter.title,
        textLength: chapter.publishedText.length,
        addedBySchoolId: chapter.addedBySchoolId,
        createdAt: chapter.createdAt,
      })),
    };
  }

  async update(
    id: string,
    dto: {
      title?: string;
      publisher?: string;
      classLabel?: string;
      subjectLabel?: string;
      editionYear?: string;
    },
  ) {
    await this.ensureTables();
    await this.requireBook(id);
    return this.prisma.libraryBook.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        publisher: dto.publisher?.trim(),
        classLabel: dto.classLabel?.trim(),
        subjectLabel: dto.subjectLabel?.trim(),
        editionYear: dto.editionYear?.trim() || null,
      },
    });
  }

  async grant(bookId: string, schoolId: string, grantedByUserId: string) {
    await this.ensureTables();
    await this.requireBook(bookId);
    return this.prisma.libraryBookGrant.upsert({
      where: { bookId_schoolId: { bookId, schoolId } },
      create: { bookId, schoolId, grantedByUserId },
      update: {},
    });
  }

  async revoke(bookId: string, schoolId: string) {
    await this.ensureTables();
    await this.prisma.libraryBookGrant.deleteMany({ where: { bookId, schoolId } });
    return { ok: true };
  }

  async remove(id: string) {
    await this.ensureTables();
    await this.requireBook(id);
    await this.prisma.libraryBook.delete({ where: { id } });
    return { ok: true };
  }

  private async requireBook(id: string) {
    const book = await this.prisma.libraryBook.findUnique({ where: { id }, select: { id: true } });
    if (!book) throw new NotFoundException({ code: 'BOOK_NOT_FOUND', message: 'Book not found' });
    return book;
  }

  private async ensureTables() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS library_books (
        id VARCHAR(191) NOT NULL,
        catalog_key VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        publisher VARCHAR(255) NOT NULL DEFAULT '',
        class_label VARCHAR(120) NOT NULL DEFAULT '',
        subject_label VARCHAR(120) NOT NULL DEFAULT '',
        edition_year VARCHAR(20) NULL,
        created_by_user_id VARCHAR(191) NOT NULL,
        created_by_school_id VARCHAR(191) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY library_books_catalog_key_key (catalog_key),
        KEY library_books_created_by_school_id_idx (created_by_school_id)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS library_book_chapters (
        id VARCHAR(191) NOT NULL,
        book_id VARCHAR(191) NOT NULL,
        chapter_number INT NULL,
        title VARCHAR(255) NOT NULL,
        published_text LONGTEXT NOT NULL,
        legacy_lesson_id VARCHAR(191) NULL,
        added_by_user_id VARCHAR(191) NOT NULL,
        added_by_school_id VARCHAR(191) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY library_book_chapters_legacy_lesson_id_key (legacy_lesson_id),
        UNIQUE KEY library_book_chapters_book_id_title_key (book_id, title),
        KEY library_book_chapters_book_id_idx (book_id),
        CONSTRAINT library_book_chapters_book_fk FOREIGN KEY (book_id) REFERENCES library_books(id) ON DELETE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS library_book_grants (
        id VARCHAR(191) NOT NULL,
        book_id VARCHAR(191) NOT NULL,
        school_id VARCHAR(191) NOT NULL,
        granted_by_user_id VARCHAR(191) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY library_book_grants_book_id_school_id_key (book_id, school_id),
        KEY library_book_grants_school_id_idx (school_id),
        CONSTRAINT library_book_grants_book_fk FOREIGN KEY (book_id) REFERENCES library_books(id) ON DELETE CASCADE,
        CONSTRAINT library_book_grants_school_fk FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
  }

  private async importLegacyChapters(actorUserId: string) {
    const rows = await this.prisma.$queryRaw<LegacyRow[]>`
      SELECT dl.id, dl.school_id, sch.name AS school_name, dl.chapter_name, dl.topic_name,
             dl.ai_summary, dl.created_by_id, sub.name AS subject_name, g.name AS grade_name
      FROM daily_lessons dl
      JOIN subjects sub ON sub.id = dl.subject_id
      JOIN grades g ON g.id = dl.grade_id
      JOIN schools sch ON sch.id = dl.school_id
      WHERE dl.record_kind = 'CHAPTER_LIBRARY'
    `;
    for (const row of rows) {
      const existing = await this.prisma.libraryBookChapter.findUnique({
        where: { legacyLessonId: row.id },
        select: { id: true },
      });
      if (existing) continue;
      const subject = (row.subject_name || 'Subject').trim();
      const grade = (row.grade_name || '').trim();
      const catalogKey = `legacy:${subject.toLowerCase()}|${grade.toLowerCase()}`;
      const book = await this.prisma.libraryBook.upsert({
        where: { catalogKey },
        create: {
          catalogKey,
          title: grade ? `${subject} — ${grade}` : subject,
          publisher: '',
          classLabel: grade,
          subjectLabel: subject,
          createdByUserId: row.created_by_id || actorUserId,
          createdBySchoolId: row.school_id,
        },
        update: {},
      });
      const title = (row.chapter_name || row.topic_name || 'Chapter').trim().slice(0, 255);
      const numberMatch = title.match(/\b(\d{1,3})\b/);
      const baseTitle = title;
      let storedTitle = baseTitle;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await this.prisma.libraryBookChapter.create({
            data: {
              bookId: book.id,
              chapterNumber: numberMatch ? Number(numberMatch[1]) : null,
              title: storedTitle,
              publishedText: row.ai_summary?.trim() || '',
              legacyLessonId: row.id,
              addedByUserId: row.created_by_id || actorUserId,
              addedBySchoolId: row.school_id,
            },
          });
          break;
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && attempt === 0) {
            storedTitle = `${baseTitle} (${row.id.slice(0, 6)})`.slice(0, 255);
            continue;
          }
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') break;
          throw err;
        }
      }
      await this.prisma.libraryBookGrant.upsert({
        where: { bookId_schoolId: { bookId: book.id, schoolId: row.school_id } },
        create: { bookId: book.id, schoolId: row.school_id, grantedByUserId: actorUserId },
        update: {},
      });
    }
  }
}
