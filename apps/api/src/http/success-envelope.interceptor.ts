import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import { map } from 'rxjs';
import type { Observable } from 'rxjs';

/** Adds server time to successful JSON responses; 204 remains bodyless. */
export class SuccessEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(map((data: unknown) => response.statusCode === 204 ? undefined : {
      data, meta: { serverTime: new Date().toISOString() },
    }));
  }
}
