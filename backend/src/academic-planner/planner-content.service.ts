import { Injectable } from '@nestjs/common';
import { joinCompiledChapter } from '../ai/schemas/chapter-compile.schema';
import { LibraryBooksService } from '../library-books/library-books.service';

@Injectable()
export class PlannerContentService {
  constructor(private readonly libraryBooks: LibraryBooksService) {}

  async loadChapterText(schoolId: string, libraryBookChapterId: string): Promise<{
    title: string;
    text: string;
    wordCount: number;
  }> {
    const chapter = await this.libraryBooks.getGrantedChapterForSchool(schoolId, libraryBookChapterId);
    const text = joinCompiledChapter(chapter.publishedText ?? '', chapter.exercisesText ?? '').trim();
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    return { title: chapter.title, text, wordCount };
  }
}
