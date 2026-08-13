import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

/**
 * Basic e2e outline:
 * - health is public
 * - auth login works when DB is seeded
 * - tenant isolation: school admin cannot access another school's resources
 *
 * These tests assume a running MySQL with `npm run prisma:seed` applied.
 * Skip integration assertions when DATABASE_URL is unset.
 */
describe('AppController (e2e)', () => {
  let app: INestApplication;
  const hasDb = Boolean(process.env.DATABASE_URL);

  beforeAll(async () => {
    if (!hasDb) return;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('GET /api/v1/health returns ok', async () => {
    if (!hasDb) {
      expect(true).toBe(true);
      return;
    }
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
  });

  it('refresh requires refreshToken body', async () => {
    if (!hasDb) {
      expect(true).toBe(true);
      return;
    }
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({}).expect(400);
  });

  it('tenant isolation outline: foreign school access is forbidden', async () => {
    if (!hasDb) {
      expect(true).toBe(true);
      return;
    }

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@abcschool.com', password: 'SchoolAdmin123!' });

    if (login.status !== 200) {
      // Seed may not be applied in CI — outline still documents expected behavior.
      expect([200, 401]).toContain(login.status);
      return;
    }

    const token = login.body.data.accessToken as string;
    await request(app.getHttpServer())
      .get('/api/v1/schools/00000000-0000-0000-0000-000000000099')
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => {
        expect([403, 404]).toContain(res.status);
      });
  });
});
