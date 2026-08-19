import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, RoleName } from '@prisma/client';

function databaseUrl() {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) return url;
  const parts: string[] = [];
  if (!url.includes('connection_limit=')) parts.push('connection_limit=15');
  if (!url.includes('pool_timeout=')) parts.push('pool_timeout=20');
  if (!url.includes('connect_timeout=')) parts.push('connect_timeout=10');
  if (!parts.length) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${parts.join('&')}`;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      datasources: { db: { url: databaseUrl() } },
      transactionOptions: {
        maxWait: 15_000,
        timeout: 60_000,
      },
    });
  }

  async onModuleInit() {
    // On Vercel, connect on first query so a slow/blocked DB cannot kill the whole function at import.
    if (process.env.VERCEL !== '1') {
      await this.$connect();
    }
    await this.ensureRoles();
  }

  async ensureRoles() {
    for (const name of Object.values(RoleName)) {
      await this.role.upsert({
        where: { name },
        create: { name, description: `${name} role` },
        update: {},
      });
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
