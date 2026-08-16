import 'reflect-metadata';
import type { IncomingMessage, ServerResponse } from 'http';
import express = require('express');
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import { configureNestApp } from '../src/configure-app';

const server = express();
let ready: Promise<void> | null = null;

async function createApp(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(server),
    { bufferLogs: true },
  );
  await configureNestApp(app);
  await app.init();
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    if (!ready) {
      ready = createApp().catch((error) => {
        ready = null;
        throw error;
      });
    }
    await ready;
    server(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bootstrap failed';
    console.error('Vercel Nest bootstrap failed', error);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ success: false, error: { code: 'BOOTSTRAP_FAILED', message } }));
  }
}
