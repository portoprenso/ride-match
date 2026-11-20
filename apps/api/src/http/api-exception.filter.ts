import { Catch, HttpException, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { ApiErrorSchema } from '@ride-match/contracts';
import { ApiException } from './api-exception.js';

/**
 * Enforces raw contract errors and separates transport failures from domain ones.
 * Unknown errors become 503. Diagnostics contain only a fixed event and the
 * server request ID, never bodies, URLs, headers, SQL, Zod or exception messages.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const requestId = String(response.locals.requestId);
    if (error instanceof ApiException) {
      if (error.failure.retryAfterSeconds) response.setHeader('Retry-After', error.failure.retryAfterSeconds);
      response.status(error.getStatus()).json(ApiErrorSchema.parse({ ...error.failure, requestId }));
      return;
    }
    const status = error instanceof HttpException ? error.getStatus() :
      typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;
    if (status === 400) {
      response.status(422).json({ code: 'VALIDATION_FAILED', message: 'Invalid JSON request.', requestId });
      return;
    }
    if (typeof status === 'number' && [404, 405, 413, 415].includes(status)) {
      const messages: Record<number, string> = {
        404: 'Route not found.', 405: 'Method not allowed.',
        413: 'Request body too large.', 415: 'Unsupported media type.',
      };
      response.status(status).json({ statusCode: status, message: messages[status], requestId });
      return;
    }
    this.logger.error({ event: 'internal_request_failed', requestId });
    response.status(503).json({ code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable.', requestId });
  }
}
