import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
        code = exception.name;
      } else if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, unknown>;
        message = (body.message as string) || message;
        code = (body.error as string) || (body.code as string) || exception.name;
        details = body.message;
        if (Array.isArray(body.message)) {
          message = 'Validation failed';
          code = 'VALIDATION_ERROR';
          details = body.message;
        }
      }
    } else if (exception instanceof Error) {
      const multer = exception as Error & { code?: string; name?: string };
      if (multer.name === 'MulterError') {
        status = HttpStatus.BAD_REQUEST;
        code = multer.code ?? 'UPLOAD_FAILED';
        message =
          multer.code === 'LIMIT_FILE_SIZE'
            ? 'Each photo must be 15 MB or smaller'
            : exception.message;
      } else {
        message = exception.message;
      }
    }

    response.status(status).json({
      success: false,
      error: {
        code: String(code).toUpperCase().replace(/\s+/g, '_'),
        message,
        ...(details !== undefined && details !== message ? { details } : {}),
      },
    });
  }
}
