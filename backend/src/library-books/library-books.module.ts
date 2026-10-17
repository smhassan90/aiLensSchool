import { Module } from '@nestjs/common';
import { LibraryBooksController } from './library-books.controller';
import { LibraryBooksService } from './library-books.service';

import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [LibraryBooksController],
  providers: [LibraryBooksService],
  exports: [LibraryBooksService],
})
export class LibraryBooksModule {}
