import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { ApiException } from './api-exception.js';

/**
 * Parses a contract schema without coercing or logging submitted values.
 * Neither Zod messages nor paths are echoed: paths in records/unions can contain
 * caller-controlled keys. Future endpoints may add explicit safe field mappings.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);
    if (parsed.success) return parsed.data;
    throw new ApiException({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed.',
    }, 422);
  }
}
