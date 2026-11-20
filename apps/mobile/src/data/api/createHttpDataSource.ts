import {
  apiResponseSchema, AuthSessionSchema, CurrentUserSchema, OtpChallengeSchema, SessionCredentialsSchema,
  CreateOtpChallengeInputSchema, VerifyOtpInputSchema, RefreshSessionInputSchema, LogoutInputSchema,
  SearchPlacesInputSchema, PlaceSearchResultsSchema,
} from '@ride-match/contracts';
import type { AccessTokenSource } from '../AppDataSource';
import type { ComposedDataSource } from '../createDataSource';
import { createUnavailableDataSource } from '../createUnavailableDataSource';
import { DataError } from '../errors';
import { createHttpClient } from './httpClient';

/** Validates before transport without retaining Zod messages/inputs in an error. */
function input<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try { return schema.parse(value); }
  catch { throw new DataError('unexpected', 'The outgoing API input breaks the contract.'); }
}

/**
 * BE-002 adapter: auth and places use HTTP; unfinished namespaces explicitly fail.
 * Never imports mocks. Caller token is read at request time; refresh/logout tokens
 * appear only in their JSON body. HTTP availability is separate from realtime,
 * whose subscribe operation remains unavailable until BE-005.
 */
export function createHttpDataSource(options: {
  baseUrl: string;
  accessToken: AccessTokenSource;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}): ComposedDataSource & { serverNow(): number | null } {
  const http = createHttpClient(options);
  const unavailable = createUnavailableDataSource('This API operation is not implemented yet.');
  return {
    dispose: () => http.dispose(), devControls: null, demoSignIn: null, serverNow: http.serverNow,
    dataSource: {
      ...unavailable,
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
      events: { ...unavailable.events, watchConnection: http.watchConnection },
    },
  };
}
