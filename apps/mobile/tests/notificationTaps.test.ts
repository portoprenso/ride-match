import type { NotificationPayloadDto, OwnRideRequestDto } from '@ride-match/contracts';
import { QueryClient } from '@tanstack/react-query';

import type { AppDataSource } from '../src/data/AppDataSource';
import { DataError } from '../src/data/errors';
import type { SessionController, SessionState } from '../src/features/auth/createSessionController';
import { createNotificationTapCoordinator } from '../src/features/notifications/createNotificationTapCoordinator';
import { resolveNotification, type NotificationDestination } from '../src/features/notifications/notificationEntry';
import type { NotificationTap } from '../src/platform/notifications/localNotifications';

/*
 * The tap coordinator's ordering and the target resolution (NOTIFICATION-001-C), without the
 * app. Payloads are synthetic: IDs and times only.
 */

const NOW = Date.parse('2026-11-09T09:00:00.000Z');
const VIEWER = { kind: 'user', userId: 'usr_1' } as const;

const payload = (overrides: Partial<NotificationPayloadDto> = {}) =>
  ({
    id: 'ntf_1',
    schemaVersion: 1,
    kind: 'group.ready',
    groupId: 'grp_1',
    issuedAt: '2026-11-09T08:59:00.000Z',
    expiresAt: '2026-11-09T09:30:00.000Z',
    ...overrides,
  }) as NotificationPayloadDto;

const validTap = (requestId: string, overrides: Partial<NotificationPayloadDto> = {}): NotificationTap => ({
  kind: 'valid',
  payload: payload({ id: requestId, ...overrides }),
  requestId,
});

function fakeSession(initial: SessionState) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    controller: {
      getState: () => state,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    } as unknown as SessionController,
    set(next: SessionState) {
      state = next;
      listeners.forEach((listener) => listener());
    },
  };
}

const signedIn = (id = 'usr_1') => ({ status: 'signed-in', user: { id }, persisted: true }) as unknown as SessionState;

function setup(options: { session?: SessionState; initialTap?: NotificationTap | null } = {}) {
  let listener: ((tap: NotificationTap) => void) | null = null;
  const session = fakeSession(options.session ?? signedIn());
  const opened: NotificationDestination[] = [];
  const pending: ((destination: NotificationDestination) => void)[] = [];
  const resolve = jest.fn(() => new Promise<NotificationDestination>((settle) => pending.push(settle)));
  const coordinator = createNotificationTapCoordinator({
    notifications: {
      onTap: (next) => {
        listener = next;
        return () => (listener = null);
      },
      takeInitialTap: async () => options.initialTap ?? null,
    },
    session: session.controller,
    resolve,
    open: (destination) => opened.push(destination),
    now: () => NOW,
  });
  coordinator.start();
  return {
    coordinator,
    session,
    opened,
    resolve,
    tap: (value: NotificationTap) => listener?.(value),
    answer: (index: number, destination: NotificationDestination) => pending[index]!(destination),
  };
}

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

describe('notification tap coordinator', () => {
  it('opens the unavailable screen for invalid and expired taps without reading anything', async () => {
    const app = setup();
    app.tap({ kind: 'invalid', requestId: 'os_1' });
    app.tap({ kind: 'expired', id: 'ntf_2', requestId: 'ntf_2' });
    await flush();
    expect(app.opened).toEqual([{ kind: 'unavailable' }, { kind: 'unavailable' }]);
    expect(app.resolve).not.toHaveBeenCalled();
  });

  it('handles the launch tap once, even when the listener reports it too', async () => {
    const app = setup({ initialTap: validTap('ntf_1') });
    app.tap(validTap('ntf_1'));
    await flush();
    expect(app.resolve).toHaveBeenCalledTimes(1);
    app.answer(0, { kind: 'group', groupId: 'grp_1' });
    await flush();
    expect(app.opened).toEqual([{ kind: 'group', groupId: 'grp_1' }]);
  });

  it('waits for the stored session before reading, and needs a signed-in rider', async () => {
    const app = setup({ session: { status: 'restoring' } });
    app.tap(validTap('ntf_1'));
    await flush();
    expect(app.resolve).not.toHaveBeenCalled();

    app.session.set(signedIn());
    await flush();
    expect(app.resolve).toHaveBeenCalledWith(payload(), VIEWER);

    const anonymous = setup({ session: { status: 'restoring' } });
    anonymous.tap(validTap('ntf_2'));
    anonymous.session.set({ status: 'signed-out', reason: 'none' } as unknown as SessionState);
    await flush();
    expect(anonymous.resolve).not.toHaveBeenCalled();
    expect(anonymous.opened).toEqual([{ kind: 'unavailable' }]);
  });

  it('treats a payload that expired while the session was restored as unavailable', async () => {
    const app = setup({ session: { status: 'restoring' } });
    app.tap(validTap('ntf_1', { expiresAt: '2026-11-09T09:00:00.000Z' }));
    app.session.set(signedIn());
    await flush();
    expect(app.resolve).not.toHaveBeenCalled();
    expect(app.opened).toEqual([{ kind: 'unavailable' }]);
  });

  it('lets the latest tap win, and drops an answer read for a rider who has since changed', async () => {
    const app = setup();
    app.tap(validTap('ntf_1'));
    await flush();
    // A newer tap while the first is being read: the first's answer, even if later, opens nothing.
    app.tap(validTap('ntf_2', { groupId: 'grp_2' }));
    await flush();
    expect(app.resolve).toHaveBeenCalledTimes(2);
    app.answer(1, { kind: 'group', groupId: 'grp_2' });
    app.answer(0, { kind: 'group', groupId: 'grp_1' });
    await flush();
    expect(app.opened).toEqual([{ kind: 'group', groupId: 'grp_2' }]);

    app.tap(validTap('ntf_3'));
    await flush();
    app.session.set(signedIn('usr_2'));
    app.answer(2, { kind: 'group', groupId: 'grp_1' });
    await flush();
    expect(app.opened).toEqual([{ kind: 'group', groupId: 'grp_2' }, { kind: 'unavailable' }]);
  });

  it('opens nothing after disposal', async () => {
    const app = setup();
    app.tap(validTap('ntf_1'));
    await flush();
    app.coordinator.dispose();
    app.answer(0, { kind: 'group', groupId: 'grp_1' });
    await flush();
    app.tap(validTap('ntf_2'));
    await flush();
    expect(app.opened).toEqual([]);
  });
});

describe('notification target resolution', () => {
  const request = (overrides: Partial<OwnRideRequestDto> = {}) =>
    ({ id: 'ride_1', status: 'active', ...overrides }) as OwnRideRequestDto;

  function source(reads: { ownRequest?: () => Promise<OwnRideRequestDto | null>; group?: () => Promise<unknown> }) {
    return {
      rides: { getOwnRequest: jest.fn(reads.ownRequest ?? (async () => null)) },
      groups: { getGroup: jest.fn(reads.group ?? (async () => ({}))) },
    } as unknown as AppDataSource;
  }
  const refusal = (code: 'MEMBERSHIP_REQUIRED' | 'NOT_FOUND' | 'HISTORY_EXPIRED' | 'SERVICE_UNAVAILABLE') =>
    DataError.fromSource({ code, message: 'Refused', requestId: 'req_1' } as never);
  const matches = payload({ kind: 'matches.available', rideRequestId: 'ride_1', target: null } as never);
  const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });

  it('opens the map only for the rider’s own request while it is still active', async () => {
    await expect(
      resolveNotification(matches, VIEWER, source({ ownRequest: async () => request() }), client()),
    ).resolves.toEqual({
      kind: 'home',
    });
    for (const current of [
      null,
      request({ id: 'ride_2' }),
      request({ status: 'grouped' }),
      request({ status: 'expired' }),
    ]) {
      await expect(
        resolveNotification(matches, VIEWER, source({ ownRequest: async () => current }), client()),
      ).resolves.toEqual({ kind: 'unavailable' });
    }
  });

  it('opens a group or its chat only when the source lets the rider read the group', async () => {
    await expect(resolveNotification(payload(), VIEWER, source({}), client())).resolves.toEqual({
      kind: 'group',
      groupId: 'grp_1',
    });
    const chat = payload({ kind: 'chat.message_created', messageId: 'msg_1' } as never);
    await expect(resolveNotification(chat, VIEWER, source({}), client())).resolves.toEqual({
      kind: 'chat',
      groupId: 'grp_1',
    });
    for (const code of ['MEMBERSHIP_REQUIRED', 'NOT_FOUND', 'HISTORY_EXPIRED'] as const) {
      await expect(
        resolveNotification(chat, VIEWER, source({ group: () => Promise.reject(refusal(code)) }), client()),
      ).resolves.toEqual({ kind: 'unavailable' });
    }
  });

  it('opens the target when the source could not answer, so its screen can retry', async () => {
    const outage = source({
      group: () => Promise.reject(refusal('SERVICE_UNAVAILABLE')),
      ownRequest: () => Promise.reject(new DataError('network', 'Offline')),
    });
    await expect(resolveNotification(payload(), VIEWER, outage, client())).resolves.toEqual({
      kind: 'group',
      groupId: 'grp_1',
    });
    await expect(resolveNotification(matches, VIEWER, outage, client())).resolves.toEqual({ kind: 'home' });
  });
});
