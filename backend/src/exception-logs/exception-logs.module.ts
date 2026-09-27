import { Global, Module } from '@nestjs/common';
import { ExceptionLogService } from './exception-log.service';

@Global()
@Module({
  providers: [ExceptionLogService],
  exports: [ExceptionLogService],
})
export class ExceptionLogsModule {}
