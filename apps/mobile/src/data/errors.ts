import { ApiErrorSchema, type ApiErrorCode, type ApiErrorDto } from '@ride-match/contracts';

/**
 * How a data operation failed, which decides what the app does next.
 *
 * - `source`: the source answered with an error body; branch on its `code`.
 * - `network`: no answer arrived (offline, timeout, lost response). A read may be retried; a
 *   mutation's outcome is unknown, so it is retried only with the same operation ID.
 * - `unavailable`: the data source or the operation does not exist in this build.
 * - `aborted`: the caller cancelled a read; never shown to the user.
 * - `unexpected`: anything else, including an error body that breaks the contract. It is a bug;
 *   the app shows a generic failure.
 */
export type DataErrorKind = 'source' | 'network' | 'unavailable' | 'aborted' | 'unexpected';

/**
 * The mobile error model: every rejection from the data source reaches feature code as a
 * `DataError` (see {@link toDataError}).
 *
 * `message` is for diagnostics. For `source` it is the body's message, which the contract keeps
 * free of submitted values and private data; feature code shows its own copy chosen by `kind`
 * and `body.code`, never message text.
 */
export class DataError extends Error {
  readonly kind: DataErrorKind;
  /** The source's validated error body, for `source` only; otherwise `null`. */
  readonly body: ApiErrorDto | null;

  constructor(kind: DataErrorKind, message: string, options?: { body?: ApiErrorDto; cause?: unknown }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'DataError';
    this.kind = kind;
    this.body = options?.body ?? null;
  }

  /**
   * Builds the error for a source error body after validating it against the contract. An
   * implementation calls it with the body it received or, in the simulator, produced. A body
   * that fails validation becomes an `unexpected` error that carries none of it.
   */
  static fromSource(body: unknown): DataError {
    const parsed = ApiErrorSchema.safeParse(body);
    return parsed.success
      ? new DataError('source', parsed.data.message, { body: parsed.data })
      : new DataError('unexpected', 'The source returned an error body that breaks the contract.');
  }

  /** The source's error code, or `null` when the failure did not come from the source. */
  get code(): ApiErrorCode | null {
    return this.body?.code ?? null;
  }
}

/**
 * The configured data source, or one of its operations, does not exist in this build: the API
 * data source before it is implemented, or an operation whose mock arrives with a later card.
 *
 * It is never a reason to fall back to another data source; the app shows the failure instead.
 */
export class DataSourceUnavailableError extends DataError {
  constructor(message: string) {
    super('unavailable', message);
    this.name = 'DataSourceUnavailableError';
  }
}

/**
 * Normalizes any rejection into a {@link DataError}: a `DataError` passes through, an
 * `AbortError` (what aborting a read's signal produces) becomes `aborted`, and anything else
 * becomes `unexpected`, keeping the original as `cause` for debugging. Implementations report
 * source and network failures as `DataError`s themselves, since only they can tell them apart.
 */
export function toDataError(error: unknown): DataError {
  if (error instanceof DataError) return error;
  if (error instanceof Error && error.name === 'AbortError') {
    return new DataError('aborted', 'The read was cancelled.', { cause: error });
  }
  return new DataError('unexpected', 'The data operation failed unexpectedly.', { cause: error });
}

/**
 * Settles like `operation`, but rejects only with a {@link DataError}. Query functions and
 * mutation functions wrap their data-source call in it, so `error` in Query is always a
 * `DataError`.
 */
export async function withDataErrors<Result>(operation: Promise<Result>): Promise<Result> {
  try {
    return await operation;
  } catch (error) {
    throw toDataError(error);
  }
}

/**
 * Whether repeating the same read soon may succeed: a lost answer, or a source that says it is
 * temporarily unavailable. Never true for refusals such as `MEMBERSHIP_REQUIRED`, which a retry
 * would only repeat, or for rate limits, which say when to retry.
 */
export function isRetryableRead(error: DataError): boolean {
  return error.kind === 'network' || error.code === 'SERVICE_UNAVAILABLE';
}
