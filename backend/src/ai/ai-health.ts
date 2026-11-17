export type AiHealthReason =
  | 'missing_key'
  | 'invalid_key'
  | 'billing'
  | 'rate_limit'
  | 'timeout'
  | 'no_response'
  | 'provider_error';

export type AiProviderName = 'openai' | 'cursor';

export type AiProviderHealth = {
  provider: AiProviderName;
  configured: boolean;
  model: string | null;
  responding: boolean;
  latencyMs: number;
  reason: AiHealthReason | null;
  message: string;
  reply: string | null;
};

export type AiHealthReport = {
  status: 'ok' | 'degraded' | 'down';
  checkedAt: string;
  cached: boolean;
  /** Provider teaching-pack generation tries first. */
  primary: AiProviderName | null;
  providers: AiProviderHealth[];
};

const REASON_MESSAGE: Record<Exclude<AiHealthReason, 'provider_error'>, string> = {
  missing_key: 'No API key is configured.',
  invalid_key: 'The API key was rejected.',
  billing: 'The provider refused the request because billing or quota is not available.',
  rate_limit: 'The provider is rate limiting requests.',
  timeout: 'The provider did not answer in time.',
  no_response: 'The provider answered with an empty response.',
};

export function sanitizeAiDetail(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, '[key]')
    .replace(/key_[A-Za-z0-9_-]{8,}/g, '[key]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [key]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

export function classifyAiFailure(input: { status?: number; detail?: string }): {
  reason: AiHealthReason;
  message: string;
} {
  const detail = sanitizeAiDetail(input.detail ?? '');
  const lower = detail.toLowerCase();
  const status = input.status;

  if (
    status === 401 ||
    /invalid[_ ]api[_ ]key|incorrect api key|unauthorized|authentication failed|invalid key/.test(lower)
  ) {
    return { reason: 'invalid_key', message: REASON_MESSAGE.invalid_key };
  }
  if (
    status === 402 ||
    /insufficient_quota|billing_hard_limit|billing|payment required|unpaid invoice|insufficient credits|credit balance|quota/.test(
      lower,
    )
  ) {
    return { reason: 'billing', message: REASON_MESSAGE.billing };
  }
  if (status === 429 || /rate limit|too many requests/.test(lower)) {
    return { reason: 'rate_limit', message: REASON_MESSAGE.rate_limit };
  }
  if (/timed out|timeout|aborted|aborterror/.test(lower)) {
    return { reason: 'timeout', message: REASON_MESSAGE.timeout };
  }
  if (/empty/.test(lower)) {
    return { reason: 'no_response', message: REASON_MESSAGE.no_response };
  }
  return {
    reason: 'provider_error',
    message: detail || 'The provider returned an error.',
  };
}

export function missingKeyHealth(provider: AiProviderName, envName: string): AiProviderHealth {
  return {
    provider,
    configured: false,
    model: null,
    responding: false,
    latencyMs: 0,
    reason: 'missing_key',
    message: `${envName} is not set.`,
    reply: null,
  };
}

export function summarizeAiHealth(input: {
  providers: AiProviderHealth[];
  checkedAt: string;
  cached?: boolean;
}): AiHealthReport {
  const configured = input.providers.filter((provider) => provider.configured);
  const responding = configured.filter((provider) => provider.responding);
  const primary =
    input.providers.find((provider) => provider.provider === 'openai' && provider.configured)?.provider ??
    input.providers.find((provider) => provider.provider === 'cursor' && provider.configured)?.provider ??
    null;
  const status =
    configured.length === 0 || responding.length === 0
      ? 'down'
      : responding.length === configured.length
        ? 'ok'
        : 'degraded';
  return {
    status,
    checkedAt: input.checkedAt,
    cached: input.cached ?? false,
    primary,
    providers: input.providers,
  };
}
