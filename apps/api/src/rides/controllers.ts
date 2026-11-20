import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CancelRideRequestInputSchema, CreateRideRequestInputSchema, IdSchema, JoinGroupInputSchema, LeaveGroupInputSchema, UpdateGroupStatusInputSchema } from '@ride-match/contracts';
import type { CancelRideRequestInput, CreateRideRequestInput, JoinGroupInput, LeaveGroupInput, UpdateGroupStatusInput } from '@ride-match/contracts';
import { AuthService } from '../auth/auth.service.js';
import { RequestRateGuard } from '../auth/request-rate.guard.js';
import { ZodValidationPipe } from '../http/zod-validation.pipe.js';
import { RideRequestsService } from './requests.service.js';
import { RideGroupsService } from './groups.service.js';
import { DiscoveryService } from './discovery.service.js';
import { parseNearbyQuery, requireOperationKey } from './transport.js';

/** HTTP/auth boundary; all state/expiry/retry policies belong to the domain services. */
@Controller('rides') @UseGuards(RequestRateGuard)
export class RidesController {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(RideRequestsService) private readonly rides: RideRequestsService, @Inject(DiscoveryService) private readonly discovery: DiscoveryService) {}
  @Get('nearby')
  async nearby(@Query() query: Record<string, unknown>, @Headers('authorization') authorization?: string) {
    const input = parseNearbyQuery(query);
    return this.discovery.nearby(await this.auth.authenticate(authorization, true), input);
  }
  @Get(':id')
  async read(@Param('id', new ZodValidationPipe(IdSchema)) id: string, @Headers('authorization') authorization?: string) {
    await this.auth.authenticate(authorization, true);
    return this.rides.publicRead(id);
  }
  @Post() @HttpCode(200)
  async create(@Body(new ZodValidationPipe(CreateRideRequestInputSchema)) input: CreateRideRequestInput, @Headers('idempotency-key') key?: string, @Headers('authorization') authorization?: string) {
    requireOperationKey(key, input.operationId);
    return this.rides.create((await this.auth.authenticate(authorization))!, input);
  }
  @Post(':id/cancel') @HttpCode(200)
  async cancel(@Param('id', new ZodValidationPipe(IdSchema)) id: string, @Body(new ZodValidationPipe(CancelRideRequestInputSchema)) input: CancelRideRequestInput, @Headers('idempotency-key') key?: string, @Headers('authorization') authorization?: string) {
    requireOperationKey(key, input.operationId);
    return this.rides.cancel((await this.auth.authenticate(authorization))!, id, input);
  }
  @Get(':id/matches')
  async matches(@Param('id', new ZodValidationPipe(IdSchema)) id: string, @Headers('authorization') authorization?: string) {
    return this.rides.matches((await this.auth.authenticate(authorization))!, id);
  }
}

@Controller('me/ride-request') @UseGuards(RequestRateGuard)
export class OwnRideController {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(RideRequestsService) private readonly rides: RideRequestsService) {}
  @Get()
  async read(@Headers('authorization') authorization?: string) { return this.rides.own((await this.auth.authenticate(authorization))!); }
}

/** DELETE leave intentionally retains its validated JSON body and matching operation key. */
@Controller('groups') @UseGuards(RequestRateGuard)
export class GroupsController {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(RideGroupsService) private readonly groups: RideGroupsService) {}
  @Get(':id/preview')
  async preview(@Param('id', new ZodValidationPipe(IdSchema)) id: string, @Headers('authorization') authorization?: string) {
    await this.auth.authenticate(authorization, true); return this.groups.preview(id);
  }
  @Get(':id')
  async read(@Param('id', new ZodValidationPipe(IdSchema)) id: string, @Headers('authorization') authorization?: string) {
    return this.groups.read((await this.auth.authenticate(authorization))!, id);
  }
  @Post('join') @HttpCode(200)
  async join(@Body(new ZodValidationPipe(JoinGroupInputSchema)) input: JoinGroupInput, @Headers('idempotency-key') key?: string, @Headers('authorization') authorization?: string) {
    requireOperationKey(key, input.operationId); return this.groups.join((await this.auth.authenticate(authorization))!, input);
  }
  @Delete(':id/members/me') @HttpCode(200)
  async leave(@Param('id', new ZodValidationPipe(IdSchema)) id: string, @Body(new ZodValidationPipe(LeaveGroupInputSchema)) input: LeaveGroupInput, @Headers('idempotency-key') key?: string, @Headers('authorization') authorization?: string) {
    requireOperationKey(key, input.operationId); return this.groups.leave((await this.auth.authenticate(authorization))!, id, input);
  }
  @Patch(':id/status') @HttpCode(200)
  async update(@Param('id', new ZodValidationPipe(IdSchema)) id: string, @Body(new ZodValidationPipe(UpdateGroupStatusInputSchema)) input: UpdateGroupStatusInput, @Headers('idempotency-key') key?: string, @Headers('authorization') authorization?: string) {
    requireOperationKey(key, input.operationId); return this.groups.update((await this.auth.authenticate(authorization))!, id, input);
  }
}
