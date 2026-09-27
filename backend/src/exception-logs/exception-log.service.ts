import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { pageQuery, paginate, PaginationDto } from '../common/dto/pagination.dto';

export const API_EXCEPTION_RETENTION_DAYS = 7;

export type ParsedApiException = {
  statusCode: number;
  errorCode: string;
  message: string;
  details?: unknown;
};

@Injectable()
export class ExceptionLogService {
  private readonly logger = new Logger(ExceptionLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  parseException(exception: unknown): ParsedApiException {
    let statusCode = 500;
    let errorCode = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details: unknown;

    if (exception && typeof exception === 'object' && 'getStatus' in exception) {
      const httpEx = exception as { getStatus: () => number; getResponse: () => unknown; name: string };
      statusCode = httpEx.getStatus();
      const res = httpEx.getResponse();
      if (typeof res === 'string') {
        message = res;
        errorCode = httpEx.name;
      } else if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, unknown>;
        const nestedError = body.error;
        if (typeof nestedError === 'object' && nestedError !== null) {
          const err = nestedError as Record<string, unknown>;
          errorCode = String(err.code ?? errorCode);
          message = String(err.message ?? message);
          if (err.details !== undefined) details = err.details;
        } else {
          message = String(body.message ?? message);
          errorCode = String(body.code ?? body.error ?? httpEx.name);
          details = body.message;
          if (Array.isArray(body.message)) {
            message = 'Validation failed';
            errorCode = 'VALIDATION_ERROR';
            details = body.message;
          }
        }
      }
    } else if (exception instanceof Error) {
      const multer = exception as Error & { code?: string; name?: string };
      if (multer.name === 'MulterError') {
        statusCode = 400;
        errorCode = multer.code ?? 'UPLOAD_FAILED';
        message =
          multer.code === 'LIMIT_FILE_SIZE'
            ? 'Each photo must be 15 MB or smaller'
            : exception.message;
      } else {
        message = exception.message;
      }
    }

    errorCode = String(errorCode).toUpperCase().replace(/\s+/g, '_').slice(0, 120);
    return { statusCode, errorCode, message: message.slice(0, 4000), details };
  }

  record(input: {
    exception: unknown;
    method: string;
    path: string;
    userId?: string | null;
    schoolId?: string | null;
    userAgent?: string | null;
    ipAddress?: string | null;
  }) {
    const parsed = this.parseException(input.exception);
    void this.persist({
      ...parsed,
      method: input.method.slice(0, 16),
      path: input.path.slice(0, 512),
      userId: input.userId ?? undefined,
      schoolId: input.schoolId ?? undefined,
      userAgent: input.userAgent?.slice(0, 512) ?? undefined,
      ipAddress: input.ipAddress?.slice(0, 64) ?? undefined,
    }).catch((err) => {
      this.logger.warn(`Failed to persist API exception: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  private async persist(data: {
    method: string;
    path: string;
    statusCode: number;
    errorCode: string;
    message: string;
    details?: unknown;
    userId?: string;
    schoolId?: string;
    userAgent?: string;
    ipAddress?: string;
  }) {
    await this.prisma.apiExceptionLog.create({
      data: {
        method: data.method,
        path: data.path,
        statusCode: data.statusCode,
        errorCode: data.errorCode,
        message: data.message,
        details: data.details === undefined ? undefined : (data.details as Prisma.InputJsonValue),
        userId: data.userId,
        schoolId: data.schoolId,
        userAgent: data.userAgent,
        ipAddress: data.ipAddress,
      },
    });
    await this.pruneOlderThanRetention();
  }

  async pruneOlderThanRetention() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - API_EXCEPTION_RETENTION_DAYS);
    await this.prisma.apiExceptionLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
  }

  async findAll(
    query: PaginationDto & {
      schoolId?: string;
      userId?: string;
      statusCode?: number;
      from?: string;
      to?: string;
    },
  ) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 100);
    const createdAt: Prisma.DateTimeFilter | undefined =
      query.from || query.to
        ? {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to
              ? {
                  lte: (() => {
                    const d = new Date(query.to);
                    d.setHours(23, 59, 59, 999);
                    return d;
                  })(),
                }
              : {}),
          }
        : undefined;

    const where: Prisma.ApiExceptionLogWhereInput = {
      ...(query.schoolId ? { schoolId: query.schoolId } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.statusCode ? { statusCode: query.statusCode } : {}),
      ...(createdAt ? { createdAt } : {}),
    };

    const [items, total] = await pageQuery(
      this.prisma.apiExceptionLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          school: { select: { id: true, name: true, code: true } },
        },
      }),
      this.prisma.apiExceptionLog.count({ where }),
    );

    return paginate(items, total, page, limit);
  }

  async clearAll(confirm: boolean) {
    if (!confirm) {
      return { deleted: 0 };
    }
    const result = await this.prisma.apiExceptionLog.deleteMany({});
    return { deleted: result.count };
  }

  async clearBefore(cutoff: Date) {
    const result = await this.prisma.apiExceptionLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return { deleted: result.count };
  }
}
