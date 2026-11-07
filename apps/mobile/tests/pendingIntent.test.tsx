import { screen, userEvent } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { useState } from 'react';
import { View } from 'react-native';

import RootLayout from '../app/_layout';
import AuthLayout from '../app/auth/_layout';
import OtpRoute from '../app/auth/otp';
import PhoneRoute from '../app/auth/phone';
import SessionEndedRoute from '../app/auth/session-ended';
import { useDataSource } from '../src/data/DataSourceProvider';
import { useDevControls } from '../src/data/DevControlsProvider';
import { useSessionController, useSessionState } from '../src/features/auth/AuthSessionProvider';
import type { SessionState } from '../src/features/auth/createSessionController';
import { createPendingIntentGate, describeIntent } from '../src/features/auth/pendingIntent';
import { usePendingIntent, useRequireSignIn, useResumeIntent } from '../src/features/auth/PendingIntentProvider';
import { normalizePhoneNumber } from '../src/features/auth/signInMessages';
import { Button } from '../src/ui/Button';
import { TextField } from '../src/ui/TextField';
import { press, wait } from './helpers/locationDevice';
import { flushTimersAndRestore } from './helpers/renderApp';

const ANSWER_MS = 1000;
const GROUP_ID = '6f1c1e44-8f8f-4c36-9d4b-1f3a3f3d2b10';
const DAY_MS = 24 * 60 * 60 * 1000;

/** What a test owner does when the rider confirms; it must never run on its own. */
const join = jest.fn();
/** The owner's read of the target before it confirms; here, any authenticated read. */
const revalidated = jest.fn();

/**
 * A stand-in for a screen with a protected action (the real ones arrive with RIDE-001, GROUP-001
 * and CHAT-001): a draft, a join that needs sign-in, and the resume that reads the target again
 * before showing the confirmation.
 */
function Owner() {
  const requireSignIn = useRequireSignIn();
  const session = useSessionController();
  const status = useSessionState().status;
  const dataSource = useDataSource();
  const devControls = useDevControls();
  const pending = usePendingIntent();
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState(false);

  const showConfirmation = async () => {
    await session.runAuthenticated(() => dataSource.auth.getCurrentUser());
    revalidated();
    setConfirming(true);
  };

  useResumeIntent('join-group', (intent) => {
    expect(intent.groupId).toBe(GROUP_ID);
    void showConfirmation();
  });

  return (
    <View>
      <TextField label="Destination draft" value={draft} onChangeText={setDraft} />
      <Button
        label="Join group"
        onPress={() => {
          if (requireSignIn({ kind: 'join-group', groupId: GROUP_ID })) void showConfirmation();
        }}
      />
      {confirming && <Button label="Confirm joining" onPress={join} />}
      <Button label="Move the source clock a month on" onPress={() => devControls?.advanceTime(31 * DAY_MS)} />
      <Button
        label="Read as the rider"
        onPress={() => void session.runAuthenticated(() => dataSource.auth.getCurrentUser()).catch(() => undefined)}
      />
      <Button label={`Session ${status}`} onPress={() => undefined} />
      <Button label={`Intent ${pending.status}`} onPress={() => undefined} />
    </View>
  );
}

async function renderOwner() {
  const result = renderRouter(
    {
      _layout: RootLayout,
      index: Owner,
      'auth/_layout': AuthLayout,
      'auth/phone': PhoneRoute,
      'auth/otp': OtpRoute,
      'auth/session-ended': SessionEndedRoute,
    },
    { initialUrl: '/' },
  );
  await result;
  await wait();
  return {
    getPathname: () => result.getPathname(),
    getRootStack: () => result.getRouterState()?.routes[0]?.state?.routes.map((route) => route.name) ?? [],
  };
}

async function signInWithDemoCode() {
  await press('Continue with demo identity');
  await wait(ANSWER_MS);
  await userEvent.type(screen.getByLabelText('Demo code'), '123456');
  await press('Verify demo code');
  await wait(ANSWER_MS);
}

const button = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
  join.mockClear();
  revalidated.mockClear();
});

/** Router tests only: the pure tests below never switch to fake timers. */
const afterRouterTest = async () => {
  await flushTimersAndRestore();
  jest.restoreAllMocks();
};

describe('protected action across sign-in', () => {
  afterEach(afterRouterTest);

  it('keeps the draft when sign-in is closed, and drops the intent', async () => {
    const app = await renderOwner();
    await userEvent.type(screen.getByLabelText('Destination draft'), 'Asia Mall');

    await press('Join group');
    expect(app.getPathname()).toBe('/auth/phone');
    expect(screen.getByText('After sign-in, the group is checked again and you confirm before joining.')).toBeOnTheScreen();

    await press('Close and keep browsing');

    expect(app.getPathname()).toBe('/');
    expect(screen.getByLabelText('Destination draft').props.value).toBe('Asia Mall');
    expect(button('Intent none')).toBeOnTheScreen();
    expect(button('Session signed-out')).toBeOnTheScreen();
  });

  it('after sign-in, returns to the owner, which reads the target again and waits for confirmation', async () => {
    const app = await renderOwner();
    await userEvent.type(screen.getByLabelText('Destination draft'), 'Asia Mall');

    await press('Join group');
    await signInWithDemoCode();
    await wait(ANSWER_MS);

    expect(app.getPathname()).toBe('/');
    expect(app.getRootStack()).toEqual(['index']);
    expect(screen.getByLabelText('Destination draft').props.value).toBe('Asia Mall');
    expect(revalidated).toHaveBeenCalledTimes(1);
    expect(button('Confirm joining')).toBeOnTheScreen();
    expect(button('Intent none')).toBeOnTheScreen();
    // Sign-in performed nothing: joining waits for the rider.
    expect(join).not.toHaveBeenCalled();

    await press('Confirm joining');
    expect(join).toHaveBeenCalledTimes(1);
  });

  it('a signed-in rider proceeds at once, without sign-in', async () => {
    const app = await renderOwner();
    await press('Join group');
    await signInWithDemoCode();
    await wait(ANSWER_MS);
    revalidated.mockClear();

    await press('Join group');
    await wait(ANSWER_MS);

    expect(app.getPathname()).toBe('/');
    expect(revalidated).toHaveBeenCalledTimes(1);
  });
});

describe('session ended', () => {
  afterEach(afterRouterTest);

  async function signedInOwner() {
    const app = await renderOwner();
    await userEvent.type(screen.getByLabelText('Destination draft'), 'Asia Mall');
    await press('Join group');
    await signInWithDemoCode();
    await wait(ANSWER_MS);
    return app;
  }

  async function expireSession() {
    await press('Move the source clock a month on');
    await press('Read as the rider');
    await wait(3 * ANSWER_MS);
  }

  it('opens when a refresh is refused; Browse anonymously returns with the draft kept', async () => {
    const app = await signedInOwner();

    await expireSession();

    expect(app.getPathname()).toBe('/auth/session-ended');
    expect(screen.getByRole('header', { name: 'Sign-in needed' })).toBeOnTheScreen();
    expect(screen.getByText('Your session ended.')).toBeOnTheScreen();

    await press('Browse anonymously');

    expect(app.getPathname()).toBe('/');
    expect(app.getRootStack()).toEqual(['index']);
    expect(button('Session signed-out')).toBeOnTheScreen();
    expect(screen.getByLabelText('Destination draft').props.value).toBe('Asia Mall');
  });

  it('Sign in again leads through the phone and code steps back to the owner', async () => {
    const app = await signedInOwner();
    await expireSession();

    await press('Sign in again');
    expect(app.getPathname()).toBe('/auth/phone');
    await signInWithDemoCode();

    expect(app.getPathname()).toBe('/');
    expect(app.getRootStack()).toEqual(['index']);
    expect(button('Session signed-in')).toBeOnTheScreen();
  });
});

describe('createPendingIntentGate', () => {
  function fakeSession() {
    const listeners = new Set<() => void>();
    const session = {
      state: { status: 'signed-out', reason: 'none' } as SessionState,
      getState: () => session.state,
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      set(next: SessionState) {
        session.state = next;
        for (const listener of listeners) listener();
      },
    };
    return session;
  }
  const rider = { status: 'signed-in', user: { id: 'u1', displayName: 'Demo rider 123', avatarUrl: null }, persisted: true } as const;
  const intent = { kind: 'send-message', groupId: GROUP_ID } as const;

  it('keeps an intent while signed out and makes it ready on sign-in, for its own kind only, once', () => {
    const session = fakeSession();
    const gate = createPendingIntentGate(session);

    expect(gate.require(intent)).toBe('sign-in-required');
    expect(gate.take('send-message')).toBeNull();
    session.set(rider);

    expect(gate.getState()).toEqual({ status: 'ready', intent });
    expect(gate.take('join-group')).toBeNull();
    expect(gate.take('send-message')).toEqual(intent);
    expect(gate.take('send-message')).toBeNull();
    expect(gate.require(intent)).toBe('proceed');
    expect(gate.getState()).toEqual({ status: 'none' });
    gate.dispose();
  });

  it('puts a ready intent back on expiry, and drops it on sign-out, reset or cancel', () => {
    const session = fakeSession();
    const gate = createPendingIntentGate(session);
    gate.require(intent);
    session.set(rider);

    session.set({ status: 'signed-out', reason: 'expired' });
    expect(gate.getState()).toEqual({ status: 'awaiting-sign-in', intent });

    gate.cancel();
    expect(gate.getState()).toEqual({ status: 'none' });

    gate.require(intent);
    session.set({ status: 'signed-out', reason: 'reset' });
    expect(gate.getState()).toEqual({ status: 'none' });
    gate.dispose();
  });

  it('describes each intent without promising anything automatic', () => {
    expect(describeIntent(null)).toBeNull();
    expect(describeIntent({ kind: 'create-request' })).toMatch(/review it before it is created/);
    expect(describeIntent(intent)).toMatch(/not sent until you send it/);
  });
});

describe('normalizePhoneNumber', () => {
  it.each([
    ['+447700900123', '+447700900123'],
    [' +44 (7700) 900-123 ', '+447700900123'],
    ['0044 7700 900.123', '+447700900123'],
    ['447700900123', null],
    ['+0447700900123', null],
    ['', null],
  ])('%j → %j', (text, expected) => {
    expect(normalizePhoneNumber(text)).toBe(expected);
  });
});
