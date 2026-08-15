import { Injectable } from '@nestjs/common';

type CacheEntry = { value: unknown; expiresAt: number };

const MAX_ENTRIES = 2_000;

@Injectable()
export class MemoryCacheService {
  private readonly store = new Map<string, CacheEntry>();

  get<T>(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value as T;
  }

  set(key: string, value: unknown, ttlMs: number) {
    if (this.store.size >= MAX_ENTRIES) this.prune();
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  del(key: string) {
    this.store.delete(key);
  }

  invalidatePrefix(prefix: string) {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  async getOrSet<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;
    const value = await loader();
    this.set(key, value, ttlMs);
    return value;
  }

  private prune() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) this.store.delete(key);
    }
    if (this.store.size < MAX_ENTRIES) return;
    const overflow = this.store.size - Math.floor(MAX_ENTRIES * 0.75);
    let removed = 0;
    for (const key of this.store.keys()) {
      if (removed >= overflow) break;
      this.store.delete(key);
      removed += 1;
    }
  }
}
