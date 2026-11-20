import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { BlockListQueryInputSchema, BlockUserInputSchema, IdSchema, ReportUserInputSchema } from '@ride-match/contracts';
import type { BlockUserInput, ReportUserInput } from '@ride-match/contracts';
import { AuthService } from '../auth/auth.service.js';
import { RequestRateGuard } from '../auth/request-rate.guard.js';
import { ZodValidationPipe } from '../http/zod-validation.pipe.js';
import { flatPageQuery } from '../http/paging.js';
import { requireOperationKey } from '../rides/transport.js';
import { SafetyService } from './safety.service.js';

/** Block ownership is always session-derived. Unblock has no invented operation ID or body. */
@Controller('me/blocks') @UseGuards(RequestRateGuard)
export class BlocksController {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(SafetyService) private readonly safety: SafetyService) {}
  @Get()
  async list(@Query() query: Record<string, unknown>, @Headers('authorization') authorization?: string) {
    const input = flatPageQuery(query, ['cursor', 'limit'], ['limit'], BlockListQueryInputSchema);
    return this.safety.list((await this.auth.authenticate(authorization))!, input);
  }
  @Put(':target') @HttpCode(200)
  async block(@Param('target', new ZodValidationPipe(IdSchema)) target: string, @Body(new ZodValidationPipe(BlockUserInputSchema)) input: BlockUserInput, @Headers('idempotency-key') key?: string, @Headers('authorization') authorization?: string) {
    requireOperationKey(key, input.operationId);
    return this.safety.block((await this.auth.authenticate(authorization))!, target, input);
  }
  @Delete(':target') @HttpCode(204)
  async unblock(@Param('target', new ZodValidationPipe(IdSchema)) target: string, @Headers('authorization') authorization?: string) {
    await this.safety.unblock((await this.auth.authenticate(authorization))!, target);
  }
}

@Controller('reports') @UseGuards(RequestRateGuard)
export class ReportsController {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(SafetyService) private readonly safety: SafetyService) {}
  @Post() @HttpCode(200)
  async report(@Body(new ZodValidationPipe(ReportUserInputSchema)) input: ReportUserInput, @Headers('idempotency-key') key?: string, @Headers('authorization') authorization?: string) {
    requireOperationKey(key, input.operationId);
    return this.safety.report((await this.auth.authenticate(authorization))!, input);
  }
}
