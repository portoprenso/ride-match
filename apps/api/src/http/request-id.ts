import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Assigns a server-generated correlation ID before JSON parsing and routing.
 * Caller-supplied IDs are ignored: they are untrusted and may contain private
 * data. The same ID is returned in the header and every error body.
 */
export function requestIdMiddleware(_request: Request, response: Response, next: NextFunction): void {
  response.locals.requestId = randomUUID();
  response.setHeader('X-Request-Id', String(response.locals.requestId));
  next();
}
