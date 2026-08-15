import { Global, Module } from '@nestjs/common';
import { TenantService } from './services/tenant.service';
import { MemoryCacheService } from './services/memory-cache.service';
import { HttpCacheInterceptor } from './interceptors/http-cache.interceptor';

@Global()
@Module({
  providers: [TenantService, MemoryCacheService, HttpCacheInterceptor],
  exports: [TenantService, MemoryCacheService, HttpCacheInterceptor],
})
export class CommonModule {}
