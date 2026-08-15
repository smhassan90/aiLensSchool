import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, of, tap } from 'rxjs';
import { MemoryCacheService } from '../services/memory-cache.service';
import { AuthUser } from '../types/auth-user.type';

const GET_TTL_MS = 60_000;

@Injectable()
export class HttpCacheInterceptor implements NestInterceptor {
  constructor(private readonly cache: MemoryCacheService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      method?: string;
      originalUrl?: string;
      url?: string;
      user?: AuthUser;
    }>();
    const method = (req.method ?? 'GET').toUpperCase();
    const url = req.originalUrl ?? req.url ?? '';
    const user = req.user;
    const schoolId = user?.schoolId ?? 'public';
    const userId = user?.id ?? 'anon';

    if (method !== 'GET') {
      if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
        this.cache.invalidatePrefix(`http:${schoolId}:`);
        this.cache.invalidatePrefix(`http:user:${userId}:`);
      }
      return next.handle();
    }

    if (url.includes('/health') || url.includes('/docs') || url.includes('/uploads')) {
      return next.handle();
    }

    const key = `http:${schoolId}:${userId}:${url}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) {
      return of(hit);
    }

    return next.handle().pipe(
      tap((data) => {
        this.cache.set(key, data, GET_TTL_MS);
      }),
    );
  }
}
