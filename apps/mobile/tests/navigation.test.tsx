import { screen, userEvent } from '@testing-library/react-native';

import * as developmentMode from '../src/config/isDevelopmentMode';
import { flushTimersAndRestore, renderApp } from './helpers/renderApp';

afterEach(async () => {
  await flushTimersAndRestore();
  jest.restoreAllMocks();
});

async function press(name: string) {
  await userEvent.press(screen.getByRole('button', { name }));
}

describe('home', () => {
  it('opens anonymously on the map placeholder', async () => {
    const app = await renderApp('/');

    expect(app.getPathname()).toBe('/');
    expect(screen.getByRole('header', { name: 'Ride Match' })).toBeOnTheScreen();
    expect(screen.getByText('Map coming soon')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeOnTheScreen();
    expect(screen.queryByText('Sign in with your phone')).not.toBeOnTheScreen();
  });
});

describe('sign-in placeholders', () => {
  it('goes from home to the phone step, the code step, and Back to the phone step', async () => {
    const app = await renderApp('/');

    await press('Sign in');
    expect(app.getPathname()).toBe('/auth/phone');
    expect(screen.getByRole('header', { name: 'Sign in with your phone' })).toBeOnTheScreen();

    await press('Preview code step');
    expect(app.getPathname()).toBe('/auth/otp');
    expect(screen.getByRole('header', { name: 'Enter the code' })).toBeOnTheScreen();

    await press('Back to phone step');
    expect(app.getPathname()).toBe('/auth/phone');
    expect(screen.getByRole('header', { name: 'Sign in with your phone' })).toBeOnTheScreen();
  });

  it('Close on the phone step returns to the existing home', async () => {
    const app = await renderApp('/');
    await press('Sign in');

    await press('Close sign-in');
    expect(app.getPathname()).toBe('/');
    expect(app.getRootStack()).toEqual(['index']);
    expect(screen.getByText('Map coming soon')).toBeOnTheScreen();
  });

  it('Close on the code step returns to the existing home', async () => {
    const app = await renderApp('/');
    await press('Sign in');
    await press('Preview code step');

    await press('Close sign-in');
    expect(app.getPathname()).toBe('/');
    expect(app.getRootStack()).toEqual(['index']);
    expect(screen.getByText('Map coming soon')).toBeOnTheScreen();
  });

  it('Close after opening the code step directly falls back to home', async () => {
    const app = await renderApp('/auth/otp');
    expect(screen.getByRole('header', { name: 'Enter the code' })).toBeOnTheScreen();

    await press('Close sign-in');
    expect(app.getPathname()).toBe('/');
    expect(screen.getByText('Map coming soon')).toBeOnTheScreen();
  });

  it('Back after opening the code step directly reaches the phone step', async () => {
    const app = await renderApp('/auth/otp');

    await press('Back to phone step');
    expect(app.getPathname()).toBe('/auth/phone');
  });
});

describe('inert routes', () => {
  it.each([
    ['/groups/abc-123', 'Group details are not available yet.'],
    ['/groups/not%20a%20uuid', 'Group details are not available yet.'],
    ['/groups/%E0%A4%A', 'Group details are not available yet.'],
    ['/groups/abc-123/chat', 'Group chat is not available yet.'],
    ['/groups/%E0%A4%A/chat', 'Group chat is not available yet.'],
    ['/settings', 'Settings are not available yet.'],
  ])('%s shows only an unavailable state and a way to the map', async (url, message) => {
    const app = await renderApp(url);

    expect(screen.getByText(message)).toBeOnTheScreen();
    expect(screen.queryByText(/abc-123|not a uuid/)).not.toBeOnTheScreen();
    expect(screen.getAllByRole('button')).toHaveLength(1);

    await press('Go to map');
    expect(app.getPathname()).toBe('/');
    expect(screen.getByText('Map coming soon')).toBeOnTheScreen();
  });

  it('/dev/scenarios shows the inert scenario placeholder in development mode', async () => {
    await renderApp('/dev/scenarios');

    expect(screen.getByRole('header', { name: 'Mock scenarios' })).toBeOnTheScreen();
    expect(screen.getByText(/no scenario is running/)).toBeOnTheScreen();
  });

  it('/dev/scenarios shows an unavailable state, not a redirect, outside development mode', async () => {
    jest.spyOn(developmentMode, 'isDevelopmentMode').mockReturnValue(false);
    const app = await renderApp('/dev/scenarios');

    expect(app.getPathname()).toBe('/dev/scenarios');
    expect(screen.getByText('This page is only available in development builds.')).toBeOnTheScreen();
    expect(screen.queryByText('Mock scenarios')).not.toBeOnTheScreen();

    await press('Go to map');
    expect(app.getPathname()).toBe('/');
  });
});
