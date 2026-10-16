import { Module } from '@nestjs/common';
import { LibraryBooksController } from './library-books.controller';
import { LibraryBooksService } from './library-books.service';

@Module({
  controllers: [LibraryBooksController],
  providers: [LibraryBooksService],
  exports: [LibraryBooksService],
})
export class LibraryBooksModule {}
