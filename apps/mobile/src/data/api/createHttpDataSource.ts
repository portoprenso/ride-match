import {
  ChatHistoryQueryInputSchema, ChatMessagePageSchema, SendChatMessageInputSchema, ChatMessageSchema,
  ReportUserInputSchema, ReportReceiptSchema, BlockUserInputSchema, BlockUserResultSchema, BlockListQueryInputSchema, BlockListPageSchema,
  InstallationIdSchema, RegisterPushDeviceInputSchema, PushDeviceReceiptSchema,
  apiResponseSchema, AuthSessionSchema, CurrentUserSchema, OtpChallengeSchema, SessionCredentialsSchema,
  CreateOtpChallengeInputSchema, VerifyOtpInputSchema, RefreshSessionInputSchema, LogoutInputSchema,
  SearchPlacesInputSchema, PlaceSearchResultsSchema,
  CreateRideRequestInputSchema, CancelRideRequestInputSchema, OwnRideRequestSchema, RideRequestSchema,
  NearbyQueryInputSchema, NearbySnapshotSchema, RideMatchSetSchema, JoinGroupInputSchema, JoinGroupResultSchema,
  LeaveGroupInputSchema, LeaveGroupResultSchema, UpdateGroupStatusInputSchema, RideGroupSchema, GroupPreviewSchema, IdSchema,
} from '@ride-match/contracts';
import type { CreateRideRequestInput } from '@ride-match/contracts';
import type { AccessTokenSource } from '../AppDataSource';
import type { ComposedDataSource } from '../createDataSource';
import { createUnavailableDataSource } from '../createUnavailableDataSource';
import { DataError } from '../errors';
import { createRealtime } from './realtime';
import { createHttpClient } from './httpClient';

/** Validates before transport without retaining Zod messages/inputs in an error. */
function input<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try { return schema.parse(value); }
  catch { throw new DataError('unexpected', 'The outgoing API input breaks the contract.'); }
}

/**
 * BE-005 adapter: all reviewed REST operations use HTTP, with authorized Socket.IO events.
 * Never imports mocks. Caller token is read at request time; refresh/logout tokens
 * appear only in their JSON body. HTTP availability is separate from realtime,
 * whose connection generations are owned by the realtime port.
 */
export function createHttpDataSource(options: {
  baseUrl: string;
  accessToken: AccessTokenSource;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  /** HTTP-only test harnesses may disable realtime; application composition always enables it. */
  realtime?: boolean;
}): ComposedDataSource & { serverNow(): number | null } {
  const http = createHttpClient(options);
  const realtime = options.realtime === false ? null : createRealtime(options);
  const unavailable = createUnavailableDataSource('This API operation is not implemented yet.');
  // Preserve the translated capture time for a stable create intent even after a new
  // clock sample or a lost response. Never log these sensitive in-memory snapshots.
  const createIntents = new Map<string, { fingerprint: string; wire: CreateRideRequestInput }>();
  const pathId = (id: string) => encodeURIComponent(input(IdSchema, id));
  return {
    clearPrivateState: () => { createIntents.clear(); realtime?.identityChanged(); },
    identityChanged: () => realtime?.identityChanged(),
    setSessionRenewal: (callback) => realtime?.setSessionRenewal(callback),
    dispose: () => { createIntents.clear(); realtime?.dispose(); http.dispose(); }, devControls: null, demoSignIn: null, serverNow: http.serverNow,
    dataSource: {
      ...unavailable,
      serverTimeOffset: http.serverTimeOffset,
      auth: {
        requestOtp: async (value) => http.request('auth/otp/challenges', apiResponseSchema(OtpChallengeSchema), {
          method: 'POST', body: input(CreateOtpChallengeInputSchema, value),
        }),
        verifyOtp: async (value) => http.request('auth/otp/verify', apiResponseSchema(AuthSessionSchema), {
          method: 'POST', body: input(VerifyOtpInputSchema, value),
        }),
        refreshSession: async (value) => http.request('auth/refresh', apiResponseSchema(SessionCredentialsSchema), {
          method: 'POST', body: input(RefreshSessionInputSchema, value),
        }),
        logout: async (value) => http.request<void>('auth/logout', null, {
          method: 'POST', body: input(LogoutInputSchema, value), noContent: true,
        }),
        getCurrentUser: (read) => http.request('me', apiResponseSchema(CurrentUserSchema), { authenticated: true, signal: read?.signal }),
      },
      places: {
        search: async (value, read) => {
          const validated = input(SearchPlacesInputSchema, value);
          const query = new URLSearchParams({
            'area.center.latitude': String(validated.area.center.latitude),
            'area.center.longitude': String(validated.area.center.longitude),
            'area.radiusMeters': String(validated.area.radiusMeters), limit: String(validated.limit),
          });
          if (validated.query !== undefined) query.set('query', validated.query);
          const places = await http.request(`places/search?${query.toString()}`, apiResponseSchema(PlaceSearchResultsSchema), {
            authenticated: true, signal: read?.signal,
          });
          if (places.length > validated.limit) throw new DataError('unexpected', 'The API exceeded the requested result limit.');
          return places;
        },
      },
      rides: {
        getNearby: async (value, read) => {
          const validated = input(NearbyQueryInputSchema, value);
          const query = new URLSearchParams({
            'viewport.southWest.latitude': String(validated.viewport.southWest.latitude),
            'viewport.southWest.longitude': String(validated.viewport.southWest.longitude),
            'viewport.northEast.latitude': String(validated.viewport.northEast.latitude),
            'viewport.northEast.longitude': String(validated.viewport.northEast.longitude), limit: String(validated.limit),
          });
          if (validated.destinationPlaceId !== undefined) query.set('destinationPlaceId', validated.destinationPlaceId);
          if (validated.departureOffsetMinutes !== undefined) query.set('departureOffsetMinutes', String(validated.departureOffsetMinutes));
          const result = await http.request(`rides/nearby?${query}`, apiResponseSchema(NearbySnapshotSchema), { authenticated: true, signal: read?.signal });
          if (result.items.length > validated.limit) throw new DataError('unexpected', 'The API exceeded the requested result limit.');
          return result;
        },
        getRide: (id, read) => http.request(`rides/${pathId(id)}`, apiResponseSchema(RideRequestSchema), { authenticated: true, signal: read?.signal }),
        getOwnRequest: (read) => http.request('me/ride-request', apiResponseSchema(OwnRideRequestSchema.nullable()), { authenticated: true, signal: read?.signal }),
        create: async (value) => {
          const validated = input(CreateRideRequestInputSchema, value);
          const fingerprint = JSON.stringify(validated);
          const remembered = createIntents.get(validated.operationId);
          let wire = validated;
          if (remembered?.fingerprint === fingerprint) wire = remembered.wire;
          else if (validated.origin.source === 'device') {
            if (http.serverTimeOffset() === null) await http.request('me', apiResponseSchema(CurrentUserSchema), { authenticated: true });
            wire = { ...validated, origin: { ...validated.origin,
              capturedAt: new Date(Date.parse(validated.origin.capturedAt) + http.serverTimeOffset()!).toISOString() } };
            if (!remembered) createIntents.set(validated.operationId, { fingerprint, wire });
          }
          return http.request('rides', apiResponseSchema(OwnRideRequestSchema), { method: 'POST', authenticated: true, body: wire, operationId: wire.operationId });
        },
        cancel: async (id, value) => {
          const validated = input(CancelRideRequestInputSchema, value);
          return http.request(`rides/${pathId(id)}/cancel`, apiResponseSchema(OwnRideRequestSchema), { method: 'POST', authenticated: true, body: validated, operationId: validated.operationId });
        },
        getMatches: (id, read) => http.request(`rides/${pathId(id)}/matches`, apiResponseSchema(RideMatchSetSchema), { authenticated: true, signal: read?.signal }),
      },
      groups: {
        join: async (value) => {
          const validated = input(JoinGroupInputSchema, value);
          return http.request('groups/join', apiResponseSchema(JoinGroupResultSchema), { method: 'POST', authenticated: true, body: validated, operationId: validated.operationId });
        },
        getPreview: (id, read) => http.request(`groups/${pathId(id)}/preview`, apiResponseSchema(GroupPreviewSchema), { authenticated: true, signal: read?.signal }),
        getGroup: (id, read) => http.request(`groups/${pathId(id)}`, apiResponseSchema(RideGroupSchema), { authenticated: true, signal: read?.signal }),
        leave: async (id, value) => {
          const validated = input(LeaveGroupInputSchema, value);
          return http.request(`groups/${pathId(id)}/members/me`, apiResponseSchema(LeaveGroupResultSchema), { method: 'DELETE', authenticated: true, body: validated, operationId: validated.operationId });
        },
        updateStatus: async (id, value) => {
          const validated = input(UpdateGroupStatusInputSchema, value);
          return http.request(`groups/${pathId(id)}/status`, apiResponseSchema(RideGroupSchema), { method: 'PATCH', authenticated: true, body: validated, operationId: validated.operationId });
        },
      },
      chat: {
        getHistory: async (id, value, read) => {
          const validated = input(ChatHistoryQueryInputSchema, value);
          const query = new URLSearchParams({ limit: String(validated.limit) });
          if (validated.beforeCursor !== undefined) query.set('beforeCursor', validated.beforeCursor);
          if (validated.afterSequence !== undefined) query.set('afterSequence', String(validated.afterSequence));
          const page = await http.request(`groups/${pathId(id)}/messages?${query}`, apiResponseSchema(ChatMessagePageSchema), { authenticated: true, signal: read?.signal });
          if (page.messages.length > validated.limit) throw new DataError('unexpected', 'The API exceeded the requested result limit.');
          return page;
        },
        send: async (id, value) => {
          const validated = input(SendChatMessageInputSchema, value);
          return http.request(`groups/${pathId(id)}/messages`, apiResponseSchema(ChatMessageSchema), { method: 'POST', authenticated: true, body: validated, operationId: validated.clientMessageId });
        },
      },
      safety: {
        report: async (value) => {
          const validated = input(ReportUserInputSchema, value);
          return http.request('reports', apiResponseSchema(ReportReceiptSchema), { method: 'POST', authenticated: true, body: validated, operationId: validated.operationId });
        },
        block: async (id, value) => {
          const validated = input(BlockUserInputSchema, value);
          return http.request(`me/blocks/${pathId(id)}`, apiResponseSchema(BlockUserResultSchema), { method: 'PUT', authenticated: true, body: validated, operationId: validated.operationId });
        },
        unblock: (id) => http.request<void>(`me/blocks/${pathId(id)}`, null, { method: 'DELETE', authenticated: true, noContent: true }),
        listBlocks: async (value, read) => {
          const validated = input(BlockListQueryInputSchema, value);
          const query = new URLSearchParams({ limit: String(validated.limit) });
          if (validated.cursor !== undefined) query.set('cursor', validated.cursor);
          const page = await http.request(`me/blocks?${query}`, apiResponseSchema(BlockListPageSchema), { authenticated: true, signal: read?.signal });
          if (page.blockedUsers.length > validated.limit) throw new DataError('unexpected', 'The API exceeded the requested result limit.');
          return page;
        },
      },
      devices: {
        register: (id,value) => http.request(`me/push-devices/${input(InstallationIdSchema,id)}`,apiResponseSchema(PushDeviceReceiptSchema),{method:'PUT',authenticated:true,body:input(RegisterPushDeviceInputSchema,value)}),
        remove: (id) => http.request<void>(`me/push-devices/${input(InstallationIdSchema,id)}`,null,{method:'DELETE',authenticated:true,noContent:true}),
      },
      events: realtime?.events ?? { ...unavailable.events, watchConnection: http.watchConnection },
    },
  };
}
