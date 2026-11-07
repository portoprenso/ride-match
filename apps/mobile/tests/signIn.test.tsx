import { screen, userEvent } from '@testing-library/react-native';

import { press, wait } from './helpers/locationDevice';
import { flushTimersAndRestore, renderApp } from './helpers/renderApp';

// Longer than the mock source's largest simulated latency.
const ANSWER_MS = 1000;
const DEMO_CODE = '123456';

afterEach(async () => {
  await flushTimersAndRestore();
  jest.restoreAllMocks();
});

async function openSignIn() {
  const app = await renderApp('/');
  await wait();
  await press('Sign in');
  return app;
}

async function type(label: string, text: string) {
  const field = screen.getByLabelText(label);
  await userEvent.clear(field);
  await userEvent.type(field, text);
}

async function continueWithDemoIdentity() {
  await press('Continue with demo identity');
  await wait(ANSWER_MS);
}

async function enterCode(code: string) {
  await type('Demo code', code);
  await press('Verify demo code');
  await wait(ANSWER_MS);
}

describe('phone step', () => {
  it('starts from a demo number, says no SMS is sent, and Close returns to the map', async () => {
    const app = await openSignIn();

    expect(app.getPathname()).toBe('/auth/phone');
    expect(screen.getByRole('header', { name: 'Sign in to continue' })).toBeOnTheScreen();
    expect(screen.getByText('Simulated sign-in')).toBeOnTheScreen();
    expect(screen.getByLabelText('Demo phone identity').props.value).toBe('+447700900123');
    expect(screen.getByLabelText('Demo phone identity').props.autoComplete).toBe('off');
    expect(screen.getByText(/This demo sends no SMS/)).toBeOnTheScreen();

    await press('Close and keep browsing');
    expect(app.getPathname()).toBe('/');
    expect(app.getRootStack()).toEqual(['index']);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeOnTheScreen();
  });

  it('checks the format first, then shows the source’s refusal of a non-demo number in its own words', async () => {
    await openSignIn();

    await type('Demo phone identity', '12345');
    await press('Continue with demo identity');
    expect(screen.getByLabelText('Demo phone identity').props.accessibilityHint).toBe(
      'Enter the number in international format, starting with +.',
    );

    await type('Demo phone identity', '+44 7911 123456');
    await continueWithDemoIdentity();
    expect(screen.getByLabelText('Demo phone identity').props.accessibilityHint).toMatch(
      /^Demo numbers only: .* No real number is needed\.$/,
    );
    expect(screen.queryByText(/7911/)).not.toBeOnTheScreen();
  });

  it('accepts a number typed with spaces and a 00 prefix', async () => {
    const app = await openSignIn();

    await type('Demo phone identity', '00 44 7700 900 456');
    await continueWithDemoIdentity();

    expect(app.getPathname()).toBe('/auth/otp');
  });
});

describe('code step', () => {
  it('signs in with the demo code and returns to the map, where Sign in is gone', async () => {
    const app = await openSignIn();
    await continueWithDemoIdentity();

    expect(screen.getByRole('header', { name: 'Demo verification' })).toBeOnTheScreen();
    expect(screen.getByText(`Use the demo code ${DEMO_CODE}.`)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Verify demo code' })).toBeDisabled();

    await enterCode(DEMO_CODE);

    expect(app.getPathname()).toBe('/');
    expect(app.getRootStack()).toEqual(['index']);
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeOnTheScreen();
  });

  it('shows a wrong code under the field and still accepts the right one', async () => {
    const app = await openSignIn();
    await continueWithDemoIdentity();

    await enterCode('000000');
    expect(screen.getByLabelText('Demo code').props.accessibilityHint).toBe('That code isn’t right. Check it and try again.');
    expect(app.getPathname()).toBe('/auth/otp');

    await enterCode(DEMO_CODE);
    expect(app.getPathname()).toBe('/');
  });

  it('asks for a fresh code after too many wrong ones, and the new challenge works', async () => {
    const app = await openSignIn();
    await continueWithDemoIdentity();

    for (let attempt = 0; attempt < 5; attempt += 1) await enterCode('000000');

    expect(screen.getByText('Code invalid or expired')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Demo verification' })).toBeOnTheScreen();
    expect(screen.getByText('Let’s get a fresh code.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Verify demo code' })).not.toBeOnTheScreen();

    // The resend interval has passed by now in real use; here it is still running.
    await wait(30_000);
    await press('Get a new demo challenge');
    await wait(ANSWER_MS);
    expect(screen.getByText('A new demo challenge is ready.')).toBeOnTheScreen();

    await enterCode(DEMO_CODE);
    expect(app.getPathname()).toBe('/');
  });

  it('asks for a fresh code when the challenge has expired', async () => {
    await openSignIn();
    await continueWithDemoIdentity();

    await wait(5 * 60 * 1000);
    await enterCode(DEMO_CODE);

    expect(screen.getByText('Code invalid or expired')).toBeOnTheScreen();
  });

  it('waits as long as the source says before another code can be requested', async () => {
    await openSignIn();
    await continueWithDemoIdentity();

    await press('Get a new demo challenge');
    await wait(ANSWER_MS);

    expect(screen.getByText(/Please wait \d+ seconds before asking for another code\./)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /Get a new demo challenge \(\d+ s\)/ })).toBeDisabled();

    await wait(30_000);
    await press('Get a new demo challenge');
    await wait(ANSWER_MS);
    expect(screen.getByText('A new demo challenge is ready.')).toBeOnTheScreen();
  });

  it('Change number goes back to the phone step with the number kept', async () => {
    const app = await openSignIn();
    await type('Demo phone identity', '+447700900777');
    await continueWithDemoIdentity();

    await press('Change number');

    expect(app.getPathname()).toBe('/auth/phone');
    expect(screen.getByLabelText('Demo phone identity').props.value).toBe('+447700900777');
  });

  it('opened directly, it only offers the phone step, and Close falls back to the map', async () => {
    const app = await renderApp('/auth/otp');
    await wait();

    expect(screen.getByText('Start with your phone number.')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Demo code')).not.toBeOnTheScreen();

    await press('Enter phone number');
    expect(app.getPathname()).toBe('/auth/phone');

    await press('Close and keep browsing');
    expect(app.getPathname()).toBe('/');
    expect(screen.getByTestId('home-map')).toBeOnTheScreen();
  });

  it('Close on the code step returns to the map without signing in', async () => {
    const app = await openSignIn();
    await continueWithDemoIdentity();

    await press('Close and keep browsing');

    expect(app.getPathname()).toBe('/');
    expect(app.getRootStack()).toEqual(['index']);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeOnTheScreen();
  });
});
