import { HttpException } from '@nestjs/common';
import type { ApiErrorDto } from '@ride-match/contracts';

/**
 * Carries a trusted domain failure, never a driver/Zod exception or user text.
 * Callers supply fixed safe copy and the documented HTTP status; requestId is
 * assigned by the global filter, outside business operations.
 */
export class ApiException extends HttpException {
  constructor(readonly failure: Omit<ApiErrorDto, 'requestId'>, status: number) {
    super(failure, status);
  }
}
