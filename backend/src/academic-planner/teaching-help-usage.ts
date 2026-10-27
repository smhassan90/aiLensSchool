import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TeachingHelpUsageService {
  private readonly hits = new Map<string, number[]>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(private readonly config: ConfigService) {}

  private limitPerMinute(): number {
    return Number(this.config.get('TEACHING_HELP_LIMIT_PER_MIN') ?? 10);
  }

  assertWithinRateLimit(userId: string, schoolId: string): void {
    const key = `${schoolId}:${userId}`;
    const now = Date.now();
    const windowMs = 60_000;
    const prev = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (prev.length >= this.limitPerMinute()) {
      throw new HttpException(
        {
          code: 'TEACHING_HELP_RATE_LIMIT',
          message: 'Too many teaching assistant requests. Please wait a minute and try again.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    prev.push(now);
    this.hits.set(key, prev);
  }

  async dedupeInFlight<T>(key: string, factory: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const promise = factory().finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, promise);
    return promise;
  }
}
