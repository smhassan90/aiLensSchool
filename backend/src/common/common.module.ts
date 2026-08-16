import { Global, Module } from '@nestjs/common';
import { TenantService } from './services/tenant.service';
import { MemoryCacheService } from './services/memory-cache.service';
import { TeacherGradeStyleService } from './services/teacher-grade-style.service';
import { HttpCacheInterceptor } from './interceptors/http-cache.interceptor';

@Global()
@Module({
  providers: [TenantService, MemoryCacheService, TeacherGradeStyleService, HttpCacheInterceptor],
  exports: [TenantService, MemoryCacheService, TeacherGradeStyleService, HttpCacheInterceptor],
})
export class CommonModule {}
