import * as SecureStore from 'expo-secure-store';

/**
 * Where a stored credential belongs. Each data source keeps its own key, so a demo credential
 * from the simulator can never be sent to a real API, and clearing one never touches another.
 */
export type CredentialNamespace = 'mock' | 'api';

/**
 * The one long-lived credential the app keeps on the device: the refresh token. Access tokens
 * never come here; they stay in memory (`docs/ARCHITECTURE.md`, credentials).
 *
 * Every method rejects when the platform store fails, for example while the keychain is
 * unavailable; callers decide what that means, and none of them may treat it as success.
 */
export type CredentialStore = {
  /** Resolves with the stored refresh token, or `null` when there is none. */
  read(): Promise<string | null>;
  /** Replaces the stored refresh token. */
  write(refreshToken: string): Promise<void>;
  /** Removes this namespace's refresh token; succeeds when there was none. */
  clear(): Promise<void>;
};

/** The part of Expo SecureStore the store uses, so tests can supply their own. */
export type SecureStoreBackend = Pick<typeof SecureStore, 'getItemAsync' | 'setItemAsync' | 'deleteItemAsync'>;

// Readable only while the device is unlocked, and never restored to another device from a
// backup. Android's backup exclusion comes from the expo-secure-store config plugin.
const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** The SecureStore key of a namespace's refresh token. Only this app's keys are ever touched. */
export function refreshTokenKey(namespace: CredentialNamespace): string {
  return `ridematch.${namespace}.refreshToken`;
}

/**
 * The credential store backed by Expo SecureStore (iOS Keychain, Android Keystore-encrypted
 * preferences), scoped to one namespace.
 *
 * @param backend SecureStore itself unless a test passes its own.
 */
export function createSecureCredentialStore(
  namespace: CredentialNamespace,
  backend: SecureStoreBackend = SecureStore,
): CredentialStore {
  const key = refreshTokenKey(namespace);
  return {
    read: () => backend.getItemAsync(key, STORE_OPTIONS),
    write: (refreshToken) => backend.setItemAsync(key, refreshToken, STORE_OPTIONS),
    clear: () => backend.deleteItemAsync(key, STORE_OPTIONS),
  };
}
