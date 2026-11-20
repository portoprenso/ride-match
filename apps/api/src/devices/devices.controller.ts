import { Body, Controller, Delete, Headers, HttpCode, Inject, Param, Put, UseGuards } from '@nestjs/common';
import { InstallationIdSchema, RegisterPushDeviceInputSchema } from '@ride-match/contracts';
import type { RegisterPushDeviceInput } from '@ride-match/contracts';
import { RequestRateGuard } from '../auth/request-rate.guard.js';
import { ZodValidationPipe } from '../http/zod-validation.pipe.js';
import { DevicesService } from './devices.service.js';

/** Session-owned installation API; neither token nor ownership is echoed in a receipt. */
@Controller('me/push-devices') @UseGuards(RequestRateGuard)
export class DevicesController {
  constructor(@Inject(DevicesService) private readonly devices: DevicesService) {}
  @Put(':id') @HttpCode(200)
  register(@Param('id', new ZodValidationPipe(InstallationIdSchema)) id: string, @Body(new ZodValidationPipe(RegisterPushDeviceInputSchema)) input: RegisterPushDeviceInput, @Headers('authorization') auth?: string) {
    return this.devices.register(auth, id, input);
  }
  @Delete(':id') @HttpCode(204)
  remove(@Param('id', new ZodValidationPipe(InstallationIdSchema)) id: string, @Headers('authorization') auth?: string) { return this.devices.remove(auth, id); }
}
