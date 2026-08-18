import 'reflect-metadata';
import type { IncomingMessage, ServerResponse } from 'http';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express = require('express');

const server = express();
let ready: Promise<void> | null = null;

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function applyCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = headerValue(req.headers.origin) || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, Accept, Origin, X-Requested-With',
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
}

async function createApp(): Promise<void> {
  const { NestFactory } = await import('@nestjs/core');
  const { ExpressAdapter } = await import('@nestjs/platform-express');
  const { AppModule } = await import('../src/app.module');
  const { configureNestApp } = await import('../src/configure-app');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, new ExpressAdapter(server), {
    bufferLogs: true,
    abortOnError: false,
  });
  await configureNestApp(app);
  await app.init();
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    if (!ready) {
      ready = createApp().catch((err) => {
        ready = null;
        throw err;
      });
    }
    await ready;
    server(req, res);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Vercel Nest bootstrap failed', err);
    if (!res.headersSent) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: false,
          error: { code: 'BOOTSTRAP_FAILED', message },
          hint: 'Check Vercel env: DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET. Leave REDIS_URL empty unless you have remote Redis.',
        }),
      );
    }
  }
}
