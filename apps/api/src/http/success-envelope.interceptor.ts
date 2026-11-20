import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import { systemClock } from '../auth/runtime.js';
import type { Clock } from '../auth/runtime.js';
import { map } from 'rxjs';
import type { Observable } from 'rxjs';

/** Uses the same source clock as domain deadlines; 204 remains bodyless. */
export class SuccessEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly clock: Clock = systemClock) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(map((data: unknown) => response.statusCode === 204 ? undefined : {
      data, meta: { serverTime: this.clock.now().toISOString() },
    }));
  }
}
