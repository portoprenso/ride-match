import { screen, userEvent } from '@testing-library/react-native';

import { flushTimersAndRestore, renderApp } from './helpers/renderApp';

afterEach(async () => {
  await flushTimersAndRestore();
  jest.restoreAllMocks();
});

async function press(name: string) {
  await userEvent.press(screen.getByRole('button', { name }));
}

describe('home', () => {
  it('opens anonymously on the map', async () => {
    const app = await renderApp('/');

    expect(app.getPathname()).toBe('/');
    expect(screen.getByRole('header', { name: 'along' })).toBeOnTheScreen();
    expect(screen.getByTestId('home-map')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeOnTheScreen();
    expect(screen.queryByText('Sign in to continue')).not.toBeOnTheScreen();
  });
});

describe('inert routes', () => {
  it.each([
    ['/groups/abc-123', 'Group details are not available yet.'],
    ['/groups/not%20a%20uuid', 'Group details are not available yet.'],
    ['/groups/%E0%A4%A', 'Group details are not available yet.'],
    ['/groups/abc-123/chat', 'Group chat is not available yet.'],
    ['/groups/%E0%A4%A/chat', 'Group chat is not available yet.'],
  ])('%s shows only an unavailable state and a way to the map', async (url, message) => {
    const app = await renderApp(url);

    expect(screen.getByText(message)).toBeOnTheScreen();
    expect(screen.queryByText(/abc-123|not a uuid/)).not.toBeOnTheScreen();
    expect(screen.getAllByRole('button')).toHaveLength(1);

    await press('Go to map');
    expect(app.getPathname()).toBe('/');
    expect(screen.getByTestId('home-map')).toBeOnTheScreen();
  });
});
