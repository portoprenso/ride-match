import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ChatHistoryQueryInputSchema, IdSchema, SendChatMessageInputSchema } from '@ride-match/contracts';
import type { SendChatMessageInput } from '@ride-match/contracts';
import { AuthService } from '../auth/auth.service.js';
import { RequestRateGuard } from '../auth/request-rate.guard.js';
import { ZodValidationPipe } from '../http/zod-validation.pipe.js';
import { flatPageQuery } from '../http/paging.js';
import { requireOperationKey } from '../rides/transport.js';
import { ChatService } from './chat.service.js';

/** Transport validates bounded text/query/key; sender and membership come only from authentication. */
@Controller('groups/:id/messages') @UseGuards(RequestRateGuard)
export class ChatController {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(ChatService) private readonly chat: ChatService) {}
  @Get()
  async history(@Param('id', new ZodValidationPipe(IdSchema)) id: string, @Query() query: Record<string, unknown>, @Headers('authorization') authorization?: string) {
    const input = flatPageQuery(query, ['beforeCursor', 'afterSequence', 'limit'], ['afterSequence', 'limit'], ChatHistoryQueryInputSchema);
    return this.chat.history((await this.auth.authenticate(authorization))!, id, input);
  }
  @Post() @HttpCode(200)
  async send(@Param('id', new ZodValidationPipe(IdSchema)) id: string, @Body(new ZodValidationPipe(SendChatMessageInputSchema)) input: SendChatMessageInput, @Headers('idempotency-key') key?: string, @Headers('authorization') authorization?: string) {
    requireOperationKey(key, input.clientMessageId);
    return this.chat.send((await this.auth.authenticate(authorization))!, id, input);
  }
}
