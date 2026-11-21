import type { LogLevel } from '@nestjs/common';
import { z } from 'zod';

const originSchema = z.url().refine((value) => {
  const url = URL.parse(value);
  return url !== null && ['http:', 'https:'].includes(url.protocol) && url.origin === value;
});
const environmentSchema = z.object({
  API_HOST: z.enum(['127.0.0.1','0.0.0.0','::1','::']).default('127.0.0.1'),
  API_APP_ENV: z.enum(['development', 'test', 'production']),
  API_PORT: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(65535)),
  DATABASE_URL: z.url().refine((value) => {
    const url = URL.parse(value);
    return url !== null && ['postgres:', 'postgresql:'].includes(url.protocol) &&
      url.hostname.length > 0 && url.pathname.length > 1;
  }),
  API_ALLOWED_ORIGINS: z.string().transform((value) => value === '' ? [] : value.split(','))
    .pipe(z.array(originSchema)),
  API_LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']),
  API_AUTH_SECRET: z.string().min(32).max(256),
  API_SMS_PROVIDER: z.enum(['development', 'disabled']),
  API_PUSH_PROVIDER: z.enum(['disabled','expo']).default('disabled'),
  EXPO_PUSH_ACCESS_TOKEN: z.string().min(1).max(4096).regex(/^[!-~]+$/).optional(),
}).refine((config) => config.API_APP_ENV !== 'production' || config.API_SMS_PROVIDER !== 'development', { path: ['API_SMS_PROVIDER'] }).refine((config) => config.API_PUSH_PROVIDER !== 'expo' || !!config.EXPO_PUSH_ACCESS_TOKEN, { path:['EXPO_PUSH_ACCESS_TOKEN'] });

export type ApiConfig = z.infer<typeof environmentSchema>;
export const API_CONFIG = Symbol('API_CONFIG');

/**
 * Validates server-only configuration before Nest or a database pool is created.
 * Unrelated process variables are ignored. Failures name keys only, never values
 * or Zod messages, which could expose credentials embedded in DATABASE_URL.
 * An empty origins string intentionally disables browser cross-origin access.
 */
export function readEnvironment(environment: NodeJS.ProcessEnv): ApiConfig {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Invalid API environment: ${keys.join(', ')}`);
  }
  return Object.freeze(result.data);
}

/** Maps the configured threshold to Nest's cumulative logging levels. */
export function nestLogLevels(level: ApiConfig['API_LOG_LEVEL']): LogLevel[] {
  const levels: LogLevel[] = ['fatal', 'error'];
  if (level !== 'error') levels.push('warn');
  if (level === 'info' || level === 'debug') levels.push('log');
  if (level === 'debug') levels.push('debug');
  return levels;
}
