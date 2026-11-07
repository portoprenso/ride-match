import type { CredentialStore } from '../../src/platform/secureStorage/credentialStore';

/**
 * An in-memory {@link CredentialStore} for session tests. `fail` makes the named calls reject
 * until it is changed, as a locked or broken keychain would.
 */
export function memoryCredentialStore(initial: string | null = null) {
  const fail = { read: false, write: false, clear: false };
  let value = initial;
  const store: CredentialStore = {
    read: jest.fn(async () => {
      if (fail.read) throw new Error('read failed');
      return value;
    }),
    write: jest.fn(async (token: string) => {
      if (fail.write) throw new Error('write failed');
      value = token;
    }),
    clear: jest.fn(async () => {
      if (fail.clear) throw new Error('clear failed');
      value = null;
    }),
  };
  return { store, fail, stored: () => value };
}
