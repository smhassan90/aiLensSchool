import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readEnv } from '../common/env';
import {
  AiHealthReport,
  AiProviderHealth,
  classifyAiFailure,
  missingKeyHealth,
  sanitizeAiDetail,
  summarizeAiHealth,
} from './ai-health';

const CACHE_MS = 60_000;
const OPENAI_TIMEOUT_MS = 15_000;
const CURSOR_TIMEOUT_MS = 25_000;

@Injectable()
export class AiHealthService {
  private cached: { at: number; report: AiHealthReport } | null = null;
  private inflight: Promise<AiHealthReport> | null = null;

  constructor(private readonly config: ConfigService) {}

  check(): Promise<AiHealthReport> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) {
      return Promise.resolve({ ...this.cached.report, cached: true });
    }
    if (this.inflight) return this.inflight;
    this.inflight = this.probe()
      .then((report) => {
        this.cached = { at: Date.now(), report };
        return report;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  private async probe(): Promise<AiHealthReport> {
    const openaiKey = readEnv('OPENAI_API_KEY')?.trim() || this.config.get<string>('OPENAI_API_KEY')?.trim();
    const cursorKey = readEnv('CURSOR_API_KEY')?.trim() || this.config.get<string>('CURSOR_API_KEY')?.trim();
    const openaiModel = readEnv('OPENAI_MODEL')?.trim() || this.config.get<string>('OPENAI_MODEL')?.trim() || 'gpt-4o-mini';
    const cursorModel =
      readEnv('CURSOR_JSON_MODEL')?.trim() ||
      readEnv('CURSOR_MODEL')?.trim() ||
      this.config.get<string>('CURSOR_MODEL')?.trim() ||
      'composer-2.5';

    const providers = await Promise.all([
      openaiKey ? this.probeOpenAi(openaiKey, openaiModel) : Promise.resolve(missingKeyHealth('openai', 'OPENAI_API_KEY')),
      cursorKey ? this.probeCursor(cursorKey, cursorModel) : Promise.resolve(missingKeyHealth('cursor', 'CURSOR_API_KEY')),
    ]);

    return summarizeAiHealth({
      providers,
      checkedAt: new Date().toISOString(),
    });
  }

  private async probeOpenAi(apiKey: string, model: string): Promise<AiProviderHealth> {
    const started = Date.now();
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 8,
          messages: [{ role: 'user', content: 'Reply with the single word ok.' }],
        }),
      });
      const raw = await response.text();
      if (!response.ok) {
        const failure = classifyAiFailure({ status: response.status, detail: openAiErrorDetail(raw) });
        return failed('openai', model, started, failure.reason, failure.message);
      }
      const reply = openAiReply(raw);
      if (!reply) {
        return failed('openai', model, started, 'no_response', 'The provider answered with an empty response.');
      }
      return ok('openai', model, started, reply);
    } catch (error) {
      const failure = classifyAiFailure({ detail: error instanceof Error ? error.message : 'OpenAI request failed' });
      return failed('openai', model, started, failure.reason, failure.message);
    }
  }

  private async probeCursor(apiKey: string, model: string): Promise<AiProviderHealth> {
    const started = Date.now();
    const id = `ai-health-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const cwd = join(tmpdir(), 'ailens-ai-health', id);
    const storeDir = join(tmpdir(), 'ailens-ai-health-store', id);
    try {
      mkdirSync(cwd, { recursive: true });
      mkdirSync(storeDir, { recursive: true });
      const { Agent, JsonlLocalAgentStore } = await import('@cursor/sdk');
      const result = (await Promise.race([
        Agent.prompt('Reply with the single word ok. Do not edit files or run tools.', {
          apiKey,
          model: { id: model },
          local: {
            cwd,
            store: new JsonlLocalAgentStore(storeDir),
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Cursor health check timed out')), CURSOR_TIMEOUT_MS),
        ),
      ])) as { status?: string; result?: string; model?: { id?: string } };

      if (result.status && result.status !== 'finished') {
        const failure = classifyAiFailure({ detail: `Cursor agent ${result.status}` });
        return failed('cursor', model, started, failure.reason, failure.message);
      }
      const reply = sanitizeAiDetail(typeof result.result === 'string' ? result.result : '');
      if (!reply) {
        return failed('cursor', model, started, 'no_response', 'The provider answered with an empty response.');
      }
      return ok('cursor', result.model?.id ?? model, started, reply);
    } catch (error) {
      const failure = classifyAiFailure({ detail: error instanceof Error ? error.message : 'Cursor request failed' });
      return failed('cursor', model, started, failure.reason, failure.message);
    }
  }
}

function ok(provider: AiProviderHealth['provider'], model: string, started: number, reply: string): AiProviderHealth {
  return {
    provider,
    configured: true,
    model,
    responding: true,
    latencyMs: Date.now() - started,
    reason: null,
    message: 'The provider returned a response.',
    reply: reply.slice(0, 80),
  };
}

function failed(
  provider: AiProviderHealth['provider'],
  model: string,
  started: number,
  reason: NonNullable<AiProviderHealth['reason']>,
  message: string,
): AiProviderHealth {
  return {
    provider,
    configured: true,
    model,
    responding: false,
    latencyMs: Date.now() - started,
    reason,
    message,
    reply: null,
  };
}

function openAiErrorDetail(raw: string): string {
  try {
    const json = JSON.parse(raw) as { error?: { code?: string; message?: string; type?: string } };
    return [json.error?.code, json.error?.type, json.error?.message].filter(Boolean).join(' ');
  } catch {
    return raw;
  }
}

function openAiReply(raw: string): string {
  try {
    const json = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> };
    return sanitizeAiDetail(json.choices?.[0]?.message?.content ?? '');
  } catch {
    return '';
  }
}
