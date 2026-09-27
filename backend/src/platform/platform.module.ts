import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { AuditModule } from '../audit/audit.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [AuditModule, FilesModule],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
