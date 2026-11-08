import { InstallationIdSchema, RegisterPushDeviceInputSchema, type PushDeviceReceiptDto } from '@ride-match/contracts';

import { authenticateSession } from './auth';
import type { WorkContext } from './simulator';
import type { MockWorld } from './world';

/*
 * Push-device registration (docs/api/realtime.md, "Push-device registration specification";
 * NOTIFICATION-001-A). The mock stores inert receipts: it never delivers remote push, and local
 * notifications stand in for delivery. The push token is a secret: it is kept in the world
 * record only, never echoed, raised in an event or logged.
 */

type Context = WorkContext<MockWorld>;

/**
 * `PUT /me/push-devices/{installationId}`: registers or updates this installation for the
 * caller. In this order: `VALIDATION_FAILED` (an invalid installation ID or body),
 * `UNAUTHENTICATED`/`SESSION_EXPIRED`, then the upsert:
 *
 * - The installation now belongs to the caller and their session, with the given token,
 *   platform and permission; another user who held it loses it (an account switch).
 * - A token registered for another installation moves here, so one token never reaches two
 *   installations, or two users.
 *
 * A retry needs no operation ID: it stores the same thing again, with a new `registeredAt`.
 */
export function registerPushDevice(
  context: Context,
  accessToken: string | null,
  installationId: string,
  input: unknown,
): PushDeviceReceiptDto {
  const parsed = RegisterPushDeviceInputSchema.safeParse(input);
  if (!parsed.success || !InstallationIdSchema.safeParse(installationId).success) {
    throw context.sourceError('VALIDATION_FAILED', 'The device registration is not valid.');
  }
  const { user, sessionId } = authenticateSession(context, accessToken);
  const devices = context.state.pushDevices;
  for (const [id, device] of devices) {
    if (id !== installationId && device.pushToken === parsed.data.pushToken) devices.delete(id);
  }
  devices.set(installationId, {
    installationId,
    userId: user.id,
    sessionId,
    ...parsed.data,
    registeredAt: context.now,
  });
  return { installationId, registeredAt: new Date(context.now).toISOString() };
}

/**
 * `DELETE /me/push-devices/{installationId}`: removes the caller's registration of this
 * installation. `VALIDATION_FAILED` for an invalid ID, then `UNAUTHENTICATED`/`SESSION_EXPIRED`.
 * It succeeds whether or not a registration exists; one held by another user is left alone,
 * and nothing says whether it existed.
 */
export function removePushDevice(context: Context, accessToken: string | null, installationId: string): void {
  if (!InstallationIdSchema.safeParse(installationId).success) {
    throw context.sourceError('VALIDATION_FAILED', 'The installation is not valid.');
  }
  const { user } = authenticateSession(context, accessToken);
  const device = context.state.pushDevices.get(installationId);
  if (device?.userId === user.id) context.state.pushDevices.delete(installationId);
}
