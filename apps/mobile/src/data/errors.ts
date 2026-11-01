/**
 * The configured data source, or one of its operations, does not exist in this build: the API
 * data source before it is implemented, or an operation whose mock arrives with a later card.
 *
 * It is never a reason to fall back to another data source; the app shows the failure instead.
 */
export class DataSourceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataSourceUnavailableError';
  }
}
