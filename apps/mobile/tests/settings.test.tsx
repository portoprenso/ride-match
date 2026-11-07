import { act, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import {
  describeSignOutOutcome,
  parseSignOutOutcome,
  signOutOutcome,
  type SignOutOutcome,
} from '../src/features/auth/signOutOutcome';
import { describeLocationSetting } from '../src/features/settings/SettingsScreen';
import { press, wait } from './helpers/locationDevice';
import { flushTimersAndRestore, renderApp } from './helpers/renderApp';

// Longer than the mock source's largest simulated latency.
const ANSWER_MS = 1000;

async function signInWithDemoCode() {
  await press('Continue with demo identity');
  await wait(ANSWER_MS);
  await userEvent.type(screen.getByLabelText('Demo code'), '123456');
  await press('Verify demo code');
  await wait(ANSWER_MS);
}

/** Opens settings from home and signs in from there; sign-in returns to settings. */
async function signedInSettings() {
  const app = await renderApp('/');
  await wait();
  await press('Settings');
  await press('Sign in');
  await signInWithDemoCode();
  return app;
}

async function confirmSignOut() {
  await press('Sign out');
  expect(screen.getByRole('header', { name: 'Sign out of this demo?' })).toBeOnTheScreen();
  // The sheet's confirmation, rendered after the screen's own "Sign out".
  const [, confirm] = screen.getAllByRole('button', { name: 'Sign out' });
  await userEvent.press(confirm!);
  await wait(ANSWER_MS);
}

describe('settings', () => {
  afterEach(async () => {
    await flushTimersAndRestore();
    jest.restoreAllMocks();
  });

  it('opens from home for an anonymous rider, with sign-in, location and the demo label', async () => {
    const app = await renderApp('/');
    await wait();

    await press('Settings');

    expect(app.getPathname()).toBe('/settings');
    expect(screen.getByRole('header', { name: 'Settings' })).toBeOnTheScreen();
    expect(screen.getByText('Browsing anonymously')).toBeOnTheScreen();
    expect(screen.getByText(/You’re browsing anonymously\./)).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Location: /)).toBeOnTheScreen();
    expect(screen.getByText(/This build uses synthetic riders and simulated sign-in\./)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeOnTheScreen();

    await press('Back to map');
    expect(app.getPathname()).toBe('/');
  });

  it('signs in from settings and returns there, signed in', async () => {
    const app = await signedInSettings();

    expect(app.getPathname()).toBe('/settings');
    expect(app.getRootStack()).toEqual(['index', 'settings']);
    expect(screen.getByText('Demo session')).toBeOnTheScreen();
    expect(screen.getByText(/^Signed in as .+\.$/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeOnTheScreen();
  });

  it('asks before signing out, and Keep me signed in changes nothing', async () => {
    await signedInSettings();

    await press('Sign out');
    expect(
      screen.getByText(
        'Local private data and session credentials will be cleared. Anonymous browsing remains available.',
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Signing out is not the same as leaving a group or cancelling a request. If needed, take those actions first.',
      ),
    ).toBeOnTheScreen();

    await press('Keep me signed in');

    expect(screen.queryByRole('header', { name: 'Sign out of this demo?' })).not.toBeOnTheScreen();
    expect(screen.getByText('Demo session')).toBeOnTheScreen();
  });

  it('signs out, says what was confirmed, and leaves anonymous browsing', async () => {
    const app = await signedInSettings();

    await confirmSignOut();

    expect(app.getPathname()).toBe('/settings');
    expect(screen.getByText('You’re signed out. Private details were cleared from this phone.')).toBeOnTheScreen();
    expect(screen.getByText('Browsing anonymously')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeOnTheScreen();

    await press('Back to map');
    expect(app.getPathname()).toBe('/');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeOnTheScreen();
  });

  it('removes the screens beneath settings when signing out', async () => {
    const app = await renderApp('/groups/abc-123');
    await wait();
    await act(async () => router.push('/settings'));
    await wait();
    await press('Sign in');
    await signInWithDemoCode();
    expect(app.getRootStack()).toEqual(['index', 'groups/[groupId]/index', 'settings']);

    await confirmSignOut();

    expect(app.getRootStack()).toEqual(['index', 'settings']);
    expect(screen.getByText(/^You’re signed out\./)).toBeOnTheScreen();
  });

  it('says honestly when the source did not confirm the session ended', async () => {
    const app = await signedInSettings();
    await press('Back to map');
    await press('Demo scenarios');
    await press('Next request is refused');
    await act(async () => router.back());
    await wait();
    await press('Settings');

    await confirmSignOut();

    expect(app.getPathname()).toBe('/settings');
    expect(
      screen.getByText(/^You’re signed out on this phone\. The service couldn’t confirm that the session ended/),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/Private details were cleared/)).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeOnTheScreen();
  });

  it.each(['confirmed', 'everything-deleted'])(
    'shows no outcome from a link without a sign-out (%s)',
    async (outcome) => {
      await renderApp(`/settings?signedOut=${outcome}`);
      await wait();

      expect(screen.getByText('Browsing anonymously')).toBeOnTheScreen();
      expect(screen.queryByText(/signed out/i)).not.toBeOnTheScreen();
    },
  );
});

describe('sign-out outcome', () => {
  it.each([
    [true, true, 'confirmed'],
    [false, true, 'unconfirmed'],
    [true, false, 'storage-kept'],
    [false, false, 'unconfirmed-storage-kept'],
  ] as const)('revoked %s, storage cleared %s → %s', (revoked, storageCleared, expected) => {
    expect(signOutOutcome({ revoked, storageCleared, revokeError: null })).toBe(expected);
  });

  it('warns whenever something was not confirmed, and only names success when it was', () => {
    const outcomes: SignOutOutcome[] = ['confirmed', 'unconfirmed', 'storage-kept', 'unconfirmed-storage-kept'];
    for (const outcome of outcomes) {
      const { tone, message } = describeSignOutOutcome(outcome);
      expect(tone).toBe(outcome === 'confirmed' ? 'neutral' : 'warning');
      expect(message.includes('Private details were cleared')).toBe(outcome === 'confirmed');
    }
    expect(describeSignOutOutcome('unconfirmed-storage-kept').message).toMatch(
      /and the saved sign-in couldn’t be removed/,
    );
  });

  it('reads only known outcomes from a route parameter', () => {
    expect(parseSignOutOutcome('unconfirmed')).toBe('unconfirmed');
    expect(parseSignOutOutcome('nope')).toBeNull();
    expect(parseSignOutOutcome(['confirmed'])).toBeNull();
    expect(parseSignOutOutcome(undefined)).toBeNull();
  });
});

describe('describeLocationSetting', () => {
  it.each([
    [{ status: 'unknown' }, null, 'Checking…'],
    [{ status: 'undetermined', canAskAgain: true }, null, 'Not asked yet'],
    [{ status: 'denied', canAskAgain: false }, true, 'Not allowed'],
    [{ status: 'granted', precise: true }, true, 'While using the app'],
    [{ status: 'granted', precise: false }, true, 'While using the app · approximate'],
    [{ status: 'granted', precise: true }, false, 'Allowed · location services are off'],
  ] as const)('%j with services %s → %s', (permission, servicesEnabled, expected) => {
    expect(describeLocationSetting({ permission, servicesEnabled })).toBe(expected);
  });
});
