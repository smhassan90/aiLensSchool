import { Module } from '@nestjs/common';
import { ResultsService } from './results.service';
import { ResultsController } from './results.controller';
import { CommonModule } from '../common/common.module';
import { ParentsModule } from '../parents/parents.module';

@Module({
  imports: [CommonModule, ParentsModule],
  providers: [ResultsService],
  controllers: [ResultsController],
  exports: [ResultsService],
})
export class ResultsModule {}
