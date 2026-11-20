import { Body, Controller, Get, Headers, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import {
  CreateOtpChallengeInputSchema, VerifyOtpInputSchema, RefreshSessionInputSchema, LogoutInputSchema,
} from '@ride-match/contracts';
import type { CreateOtpChallengeInput, VerifyOtpInput, RefreshSessionInput, LogoutInput } from '@ride-match/contracts';
import { ZodValidationPipe } from '../http/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import { RequestRateGuard } from './request-rate.guard.js';

/** Auth transport only; validation/rate limiting precede service operations. */
@Controller('auth')
@UseGuards(RequestRateGuard)
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('otp/challenges') @HttpCode(200)
  request(@Body(new ZodValidationPipe(CreateOtpChallengeInputSchema)) input: CreateOtpChallengeInput) {
    return this.auth.requestOtp(input.phoneNumber);
  }

  @Post('otp/verify') @HttpCode(200)
  verify(@Body(new ZodValidationPipe(VerifyOtpInputSchema)) input: VerifyOtpInput) {
    return this.auth.verifyOtp(input);
  }

  @Post('refresh') @HttpCode(200)
  refresh(@Body(new ZodValidationPipe(RefreshSessionInputSchema)) input: RefreshSessionInput) {
    return this.auth.refresh(input.refreshToken);
  }

  @Post('logout') @HttpCode(204)
  logout(@Body(new ZodValidationPipe(LogoutInputSchema)) input: LogoutInput) {
    return this.auth.logout(input.refreshToken);
  }
}

/** Keeps private projections behind current access credentials. */
@Controller('me')
@UseGuards(RequestRateGuard)
export class CurrentUserController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Get()
  get(@Headers('authorization') authorization: string | undefined) {
    return this.auth.currentUser(authorization);
  }
}
