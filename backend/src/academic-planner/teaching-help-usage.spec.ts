import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TeachingHelpUsageService } from './teaching-help-usage';

describe('TeachingHelpUsageService', () => {
  const config = {
    get: (key: string) => (key === 'TEACHING_HELP_LIMIT_PER_MIN' ? 2 : undefined),
  } as ConfigService;

  it('rejects when per-minute limit exceeded', () => {
    const svc = new TeachingHelpUsageService(config);
    svc.assertWithinRateLimit('u1', 's1');
    svc.assertWithinRateLimit('u1', 's1');
    expect(() => svc.assertWithinRateLimit('u1', 's1')).toThrow(HttpException);
  });

  it('dedupes in-flight requests', async () => {
    const svc = new TeachingHelpUsageService(config);
    let runs = 0;
    const factory = async () => {
      runs += 1;
      await new Promise((r) => setTimeout(r, 20));
      return 'ok';
    };
    const [a, b] = await Promise.all([
      svc.dedupeInFlight('k', factory),
      svc.dedupeInFlight('k', factory),
    ]);
    expect(a).toBe('ok');
    expect(b).toBe('ok');
    expect(runs).toBe(1);
  });
});
