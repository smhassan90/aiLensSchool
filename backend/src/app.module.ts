import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SchoolsModule } from './schools/schools.module';
import { BranchesModule } from './branches/branches.module';
import { StudentsModule } from './students/students.module';
import { ParentsModule } from './parents/parents.module';
import { TeachersModule } from './teachers/teachers.module';
import { AcademicsModule } from './academics/academics.module';
import { CurriculumModule } from './curriculum/curriculum.module';
import { LessonsModule } from './lessons/lessons.module';
import { HomeworkModule } from './homework/homework.module';
import { QuizzesModule } from './quizzes/quizzes.module';
import { ResultsModule } from './results/results.module';
import { AttendanceModule } from './attendance/attendance.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { EventsModule } from './events/events.module';
import { NotificationsModule } from './notifications/notifications.module';
import { BillingModule } from './billing/billing.module';
import { FilesModule } from './files/files.module';
import { AiModule } from './ai/ai.module';
import { AuditModule } from './audit/audit.module';
import { ShopModule } from './shop/shop.module';
import { QueuesModule } from './queues/queues.module';
import { areQueuesEnabled } from './queues/queues-enabled';
import { CommonModule } from './common/common.module';
import { FeesModule } from './fees/fees.module';
import { DocumentsModule } from './documents/documents.module';
import { InsightsModule } from './insights/insights.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { HealthController } from './health.controller';
import { loadRuntimeEnv } from './common/env';

const queuesEnabled = areQueuesEnabled();

@Module({
  imports: [
    // Never load .env.example in production — it points Redis/MySQL at localhost and breaks Vercel.
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env['VERCEL'] === '1' || process.env['NODE_ENV'] === 'production',
      envFilePath: ['.env'],
      load: [loadRuntimeEnv],
    }),
    LoggerModule.forRoot({
      pinoHttp:
        process.env.VERCEL === '1'
          ? { level: 'warn', autoLogging: false }
          : {
              transport:
                process.env.NODE_ENV !== 'production'
                  ? { target: 'pino-pretty', options: { singleLine: true } }
                  : undefined,
              serializers: {
                req: (req) => ({ method: req.method, url: req.url }),
                res: (res) => ({ statusCode: res.statusCode }),
              },
            },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: Number(config.get('THROTTLE_TTL') ?? 60) * 1000,
          limit: Number(config.get('THROTTLE_LIMIT') ?? 100),
        },
      ],
    }),
    ...(queuesEnabled
      ? [
          BullModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => {
              const redisUrl = config.get<string>('REDIS_URL')?.trim() || 'redis://127.0.0.1:6379';
              const url = new URL(redisUrl);
              return {
                connection: {
                  host: url.hostname,
                  port: Number(url.port || 6379),
                  password: url.password || undefined,
                  maxRetriesPerRequest: null,
                  enableReadyCheck: false,
                  lazyConnect: true,
                },
              };
            },
          }),
          QueuesModule,
        ]
      : []),
    DatabaseModule,
    CommonModule,
    AuthModule,
    UsersModule,
    SchoolsModule,
    BranchesModule,
    StudentsModule,
    ParentsModule,
    TeachersModule,
    AcademicsModule,
    CurriculumModule,
    LessonsModule,
    HomeworkModule,
    QuizzesModule,
    ResultsModule,
    AttendanceModule,
    AnnouncementsModule,
    EventsModule,
    NotificationsModule,
    BillingModule,
    FilesModule,
    AiModule,
    AuditModule,
    ShopModule,
    FeesModule,
    DocumentsModule,
    InsightsModule,
    DashboardModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
