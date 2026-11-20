import type { ApiConfig } from '../config/environment.js';
import { ApiException } from '../http/api-exception.js';

export interface Clock { now(): Date }
export const CLOCK = Symbol('CLOCK');
export const OTP_PROVIDER = Symbol('OTP_PROVIDER');
export const systemClock: Clock = { now: () => new Date() };

/** The only phone/code delivery boundary. Implementations must not log either value. */
export interface OtpProvider {
  /** Selects a code without delivery. May reject unsupported numbers. */
  createCode(phoneNumber: string): string;
  /** Rejects if delivery is not confirmed; the challenge remains unusable until resolved. */
  deliver(phoneNumber: string, code: string): Promise<void>;
}

/**
 * Local integration only: no SMS or real numbers. Production explicitly refuses
 * this provider, even when configuration is constructed outside readEnvironment.
 * A real provider and its credentials/abuse policy require a separate assignment.
 */
export function createOtpProvider(config: ApiConfig): OtpProvider {
  if (config.API_SMS_PROVIDER === 'development' && config.API_APP_ENV !== 'production') {
    return {
      createCode(phone) {
        if (!/^\+447700900\d{3}$/.test(phone)) {
          throw new ApiException({ code: 'VALIDATION_FAILED', message: 'Use a synthetic development number.' }, 422);
        }
        return '123456';
      },
      deliver: () => Promise.resolve(),
    };
  }
  return {
    createCode() { throw new ApiException({ code: 'SERVICE_UNAVAILABLE', message: 'OTP delivery is not configured.' }, 503); },
    deliver: () => Promise.reject(new ApiException({ code: 'SERVICE_UNAVAILABLE', message: 'OTP delivery is not configured.' }, 503)),
  };
}

/** Infrastructure injection for deterministic integration tests and future SMS delivery. */
export type BackendDependencies = { clock?: Clock; otpProvider?: OtpProvider };
