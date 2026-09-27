import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ExceptionLogService } from '../../exception-logs/exception-log.service';
import type { AuthUser } from '../types/auth-user.type';

@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly exceptionLogs: ExceptionLogService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { user?: AuthUser }>();

    const parsed = this.exceptionLogs.parseException(exception);

    const skipPaths = ['/api/health', '/health'];
    const path = request.url?.split('?')[0] ?? '';
    if (!skipPaths.some((p) => path.startsWith(p))) {
      this.exceptionLogs.record({
        exception,
        method: request.method ?? 'GET',
        path: path.slice(0, 512),
        userId: request.user?.id,
        schoolId: request.user?.schoolId,
        userAgent: request.headers['user-agent'] ?? null,
        ipAddress:
          (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
          request.ip ||
          null,
      });
    }

    response.status(parsed.statusCode).json({
      success: false,
      error: {
        code: parsed.errorCode,
        message: parsed.message,
        ...(parsed.details !== undefined && parsed.details !== parsed.message
          ? { details: parsed.details }
          : {}),
      },
    });
  }
}
