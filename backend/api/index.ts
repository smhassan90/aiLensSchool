import 'reflect-metadata';
import type { IncomingMessage, ServerResponse } from 'http';
import express = require('express');
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import { configureNestApp } from '../src/configure-app';

const server = express();
let ready: Promise<void> | null = null;
let bootError: Error | null = null;

async function createApp(): Promise<void> {
  try {
    const app = await NestFactory.create<NestExpressApplication>(
      AppModule,
      new ExpressAdapter(server),
      { bufferLogs: true },
    );
    await configureNestApp(app);
    await app.init();
    bootError = null;
  } catch (err) {
    bootError = err instanceof Error ? err : new Error(String(err));
    ready = null;
    throw bootError;
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    if (!ready) {
      ready = createApp();
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
