/**
 * Background queues need a reachable Redis.
 * On Vercel (or any host without remote Redis), skip BullMQ so the API can boot.
 */
export function areQueuesEnabled(): boolean {
  if (process.env.VERCEL === '1') return false;
  if (process.env.QUEUES_ENABLED === 'false') return false;
  if (process.env.QUEUES_ENABLED === 'true') return true;

  const redisUrl = (process.env.REDIS_URL ?? '').trim();
  if (!redisUrl) return false;

  const isLocal =
    /localhost|127\.0\.0\.1/i.test(redisUrl) ||
    redisUrl.startsWith('redis://localhost') ||
    redisUrl.startsWith('redis://127.0.0.1');

  // Serverless / production must not try localhost Redis
  if (isLocal && (process.env.VERCEL || process.env.NODE_ENV === 'production')) {
    return false;
  }

  return true;
}
