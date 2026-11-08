import { InstallationIdSchema, type InstallationId } from '@ride-match/contracts';
import * as SecureStore from 'expo-secure-store';

import type { SecureStoreBackend } from '../secureStorage/credentialStore';

/** Where the installation ID is kept. */
export const INSTALLATION_ID_KEY = 'ridematch.installationId';

// Like the refresh token: never restored to another device from a backup. On iOS the keychain
// can outlive an uninstall, so a reinstall may keep the ID; the registration is an upsert by
// installation, so that only means the same installation is registered again.
const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/**
 * This installation's ID for push-device registration (`InstallationIdSchema`, a UUID): read
 * from local storage, or created once with `createId` and stored. It is never derived from
 * hardware or advertising identifiers and is the same for every rider who signs in here.
 *
 * When storage fails the ID still works for this launch (kept in memory), so registration
 * isn't blocked; a later launch creates another, which the upsert by installation tolerates.
 */
export function createInstallationIdSource(
  createId: () => string,
  backend: SecureStoreBackend = SecureStore,
): () => Promise<InstallationId> {
  let pending: Promise<InstallationId> | null = null;
  const load = async (): Promise<InstallationId> => {
    try {
      const stored = await backend.getItemAsync(INSTALLATION_ID_KEY, STORE_OPTIONS);
      if (stored !== null && InstallationIdSchema.safeParse(stored).success) return stored;
    } catch {
      // Unreadable storage: a new ID for this launch, as below.
    }
    const id = InstallationIdSchema.parse(createId());
    try {
      await backend.setItemAsync(INSTALLATION_ID_KEY, id, STORE_OPTIONS);
    } catch {
      // Kept in memory for this launch; see above.
    }
    return id;
  };
  return () => (pending ??= load());
}
