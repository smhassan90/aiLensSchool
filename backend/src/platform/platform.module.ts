import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { AuditModule } from '../audit/audit.module';
import { FilesModule } from '../files/files.module';
import { ExceptionLogsModule } from '../exception-logs/exception-logs.module';

@Module({
  imports: [AuditModule, FilesModule, ExceptionLogsModule],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
