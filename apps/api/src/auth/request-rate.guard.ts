import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import { ApiException } from '../http/api-exception.js';

/**
 * Per-handler fixed-window DB limits include invalid DTO attempts. Uses the TCP
 * peer, not spoofable proxy headers; trusted-proxy deployment is deferred.
 * Duplicate Authorization fields are rejected before optional-auth lookup.
 */
@Injectable()
export class RequestRateGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    let headers = 0;
    for (let index = 0; index < request.rawHeaders.length; index += 2) {
      if (request.rawHeaders[index]?.toLowerCase() === 'authorization') headers++;
    }
    if (headers > 1) throw new ApiException({ code: 'UNAUTHENTICATED', message: 'Authentication required.' }, 401);
    await this.auth.rateLimit(`${context.getClass().name}:${context.getHandler().name}`, request.socket.remoteAddress ?? 'unknown');
    return true;
  }
}
