import { classifyAiFailure, missingKeyHealth, sanitizeAiDetail, summarizeAiHealth } from './ai-health';

describe('ai health', () => {
  it('classifies a missing quota as billing and hides the key', () => {
    const failure = classifyAiFailure({
      status: 429,
      detail: 'insufficient_quota You exceeded your current quota. Key sk-testkeyvalue12345678',
    });
    expect(failure.reason).toBe('billing');
    expect(failure.message).toMatch(/billing or quota/);
    expect(sanitizeAiDetail('rejected sk-testkeyvalue12345678')).not.toContain('sk-test');
  });

  it('classifies an invalid key and a timeout', () => {
    expect(classifyAiFailure({ status: 401, detail: 'invalid_api_key' }).reason).toBe('invalid_key');
    expect(classifyAiFailure({ detail: 'Cursor health check timed out' }).reason).toBe('timeout');
  });

  it('is down when no key is configured', () => {
    const report = summarizeAiHealth({
      checkedAt: '2026-11-16T00:00:00.000Z',
      providers: [missingKeyHealth('openai', 'OPENAI_API_KEY'), missingKeyHealth('cursor', 'CURSOR_API_KEY')],
    });
    expect(report.status).toBe('down');
    expect(report.primary).toBe(null);
    expect(report.providers[0].message).toContain('OPENAI_API_KEY');
  });

  it('is degraded when only one configured provider answers', () => {
    const report = summarizeAiHealth({
      checkedAt: '2026-11-16T00:00:00.000Z',
      providers: [
        {
          provider: 'openai',
          configured: true,
          model: 'gpt-4o-mini',
          responding: false,
          latencyMs: 200,
          reason: 'billing',
          message: 'The provider refused the request because billing or quota is not available.',
          reply: null,
        },
        {
          provider: 'cursor',
          configured: true,
          model: 'composer-2.5',
          responding: true,
          latencyMs: 900,
          reason: null,
          message: 'The provider returned a response.',
          reply: 'ok',
        },
      ],
    });
    expect(report.status).toBe('degraded');
    expect(report.primary).toBe('openai');
  });

  it('is ok when the only configured provider answers', () => {
    const report = summarizeAiHealth({
      checkedAt: '2026-11-16T00:00:00.000Z',
      providers: [
        missingKeyHealth('openai', 'OPENAI_API_KEY'),
        {
          provider: 'cursor',
          configured: true,
          model: 'composer-2.5',
          responding: true,
          latencyMs: 400,
          reason: null,
          message: 'The provider returned a response.',
          reply: 'ok',
        },
      ],
    });
    expect(report.status).toBe('ok');
    expect(report.primary).toBe('cursor');
  });
});
