import { PhoneNumberSchema } from '@ride-match/contracts';

import type { DemoSignIn } from '../../data/DemoSignIn';
import type { DataError } from '../../data/errors';

/**
 * Copy and input rules for the sign-in screens. Every message is the app's own: no source
 * message text, phone number or code is ever repeated (`DataError` keeps source messages for
 * diagnostics only).
 */

/** What went wrong, as the screen shows it: under the field, or as a notice above the actions. */
export type SignInProblem = Readonly<{
  field?: string;
  notice?: string;
  /** The source's minimum wait before asking again, in seconds, when it gave one. */
  retryAfterSeconds?: number;
}>;

const CONNECTION = 'We couldn’t reach the sign-in service. Check the connection and try again.';
const UNEXPECTED = 'Something went wrong. Try again.';

/**
 * Turns typed text into E.164 (`+` and digits), dropping spaces, dashes, dots and brackets and
 * reading a leading `00` as `+`. Returns `null` when the result is not a valid E.164 number.
 */
export function normalizePhoneNumber(text: string): string | null {
  let compact = text.replace(/[\s\-.()]/g, '');
  if (compact.startsWith('00')) compact = `+${compact.slice(2)}`;
  return PhoneNumberSchema.safeParse(compact).success ? compact : null;
}

/** The phone field's own check, before anything is sent. */
export function phoneInputProblem(text: string): string | null {
  if (text.trim() === '') return 'Enter a phone number.';
  if (normalizePhoneNumber(text) === null) return 'Enter the number in international format, starting with +.';
  return null;
}

function throttled(error: DataError): SignInProblem {
  const seconds = error.body?.retryAfterSeconds;
  return {
    notice:
      seconds === undefined
        ? 'Please wait a moment before asking for another code.'
        : `Please wait ${seconds} ${seconds === 1 ? 'second' : 'seconds'} before asking for another code.`,
    retryAfterSeconds: seconds,
  };
}

function common(error: DataError): SignInProblem {
  if (error.kind === 'network' || error.code === 'SERVICE_UNAVAILABLE') return { notice: CONNECTION };
  if (error.code === 'RATE_LIMITED') return throttled(error);
  return { notice: UNEXPECTED };
}

/** Why asking for a code (first or again) failed. */
export function requestCodeProblem(error: DataError, demo: DemoSignIn | null): SignInProblem {
  if (error.code === 'OTP_RESEND_THROTTLED') return throttled(error);
  if (error.code === 'VALIDATION_FAILED') {
    const field = error.body?.fieldErrors?.find((entry) => entry.field === 'phoneNumber');
    switch (field?.code) {
      case 'REQUIRED':
        return { field: 'Enter a phone number.' };
      case 'INVALID_VALUE':
        return { field: demo === null ? 'This phone number can’t be used to sign in.' : `${demo.numbersHint} No real number is needed.` };
      default:
        return { field: 'Enter the number in international format, starting with +.' };
    }
  }
  return common(error);
}

/**
 * Why verifying the code failed. `fresh-code` means this challenge can no longer succeed (expired,
 * used, replaced, or too many wrong codes), so the screen asks for a new one.
 */
export function verifyCodeProblem(error: DataError): SignInProblem & { freshCode?: true } {
  switch (error.code) {
    case 'OTP_INVALID':
      return { field: 'That code isn’t right. Check it and try again.' };
    case 'OTP_EXPIRED':
    case 'OTP_ATTEMPTS_EXCEEDED':
      return { freshCode: true };
    case 'VALIDATION_FAILED':
      return { field: 'Enter all the digits of the code.' };
    default:
      return common(error);
  }
}
