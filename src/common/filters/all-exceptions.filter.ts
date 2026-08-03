import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Normalized error envelope returned to API clients.
 */
export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string | string[];
  correlationId: string;
}

/**
 * Catch-all exception filter that normalizes every error into a consistent JSON envelope.
 *
 * Designed status codes:
 * - 400 validation / bad request
 * - 503 upstream / queue failures
 * - 500 unexpected (safety net)
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { correlationId?: string }>();
    const correlationId =
      request.correlationId ??
      (typeof request.headers['x-correlation-id'] === 'string'
        ? request.headers['x-correlation-id']
        : 'unknown');

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message: string | string[] = 'An unexpected error occurred';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      error = HttpStatus[statusCode] ?? exception.name;
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        'message' in exceptionResponse
      ) {
        const msg = (exceptionResponse as { message: string | string[] }).message;
        message = msg;
      } else {
        message = exception.message;
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        `Unhandled error [${correlationId}]: ${exception.message}`,
        exception.stack,
      );
    } else {
      this.logger.error(`Unhandled non-Error [${correlationId}]`, exception);
    }

    // Never leak credentials / tokens in client-facing messages
    const body: ErrorResponseBody = {
      statusCode,
      error: String(error).replace(/_/g, ' '),
      message,
      correlationId,
    };

    response.status(statusCode).json(body);
  }
}
