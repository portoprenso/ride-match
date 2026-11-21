import { act, cleanup, render, screen, userEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReportReceiptDto, ReportUserInput } from '@ride-match/contracts';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnalyticsProvider } from '../src/analytics/AnalyticsProvider';
import { createAnalytics } from '../src/analytics/createAnalytics';
import { noopSink } from '../src/analytics/sinks';
import { createUnavailableDataSource } from '../src/data/createUnavailableDataSource';
import { DataSourceProvider } from '../src/data/DataSourceProvider';
import type { DemoSignIn } from '../src/data/DemoSignIn';
import { DemoSignInProvider } from '../src/data/DemoSignInProvider';
import { DataError } from '../src/data/errors';
import { createSessionController } from '../src/features/auth/createSessionController';
import { AuthSessionProvider } from '../src/features/auth/AuthSessionProvider';
import { createPendingIntentGate } from '../src/features/auth/pendingIntent';
import { PendingIntentProvider } from '../src/features/auth/PendingIntentProvider';
import { OtpScreen } from '../src/features/auth/OtpScreen';
import * as signInFlow from '../src/features/auth/SignInFlow';
import { DestinationSheet } from '../src/features/destinations/DestinationSheet';
import { DiscoveryPanel } from '../src/features/discovery/DiscoveryPanel';
import { MeetingPointSheet } from '../src/features/groups/MeetingPointSheet';
import { LocationIntroScreen } from '../src/features/location/LocationIntroScreen';
import { ReportSheet } from '../src/features/safety/ReportSheet';
import { memoryCredentialStore } from './helpers/credentialStore';

const demo: DemoSignIn = {
  phoneNumber: '+447700900123', numbersHint: 'Synthetic identity only.', code: '123456',
};
const receipt: ReportReceiptDto = { id: 'report_copy', receivedAt: '2026-11-21T00:00:00Z' };
const disposers: (() => void)[] = [];

/** Exercises presentation capabilities with stub operations; no HTTP or native delivery is implied. */
async function renderCopy(children: ReactNode, identity: DemoSignIn | null) {
  const source = createUnavailableDataSource('Outside this copy test.');
  source.places.search = jest.fn(async () => []);
  const report = jest.fn<Promise<ReportReceiptDto>, [ReportUserInput]>();
  source.safety.report = report;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  const analytics = createAnalytics({
    sink: noopSink, environment: 'development', appVersion: 'test',
    dataSource: identity ? { kind: 'mock', scenario: 'copy-test' } : { kind: 'api', baseUrl: 'https://example.invalid/v1' },
  });
  analytics.start();
  const session = createSessionController({ auth: source.auth, store: memoryCredentialStore().store, resumeStoredSession: false });
  const gate = createPendingIntentGate(session);
  disposers.push(() => { gate.dispose(); session.dispose(); analytics.dispose(); client.clear(); });
  await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
      <DemoSignInProvider value={identity}>
        <DataSourceProvider dataSource={source}>
          <AuthSessionProvider controller={session}>
            <PendingIntentProvider gate={gate}>
              <AnalyticsProvider analytics={analytics}>
                <QueryClientProvider client={client}>{children}</QueryClientProvider>
              </AnalyticsProvider>
            </PendingIntentProvider>
          </AuthSessionProvider>
        </DataSourceProvider>
      </DemoSignInProvider>
    </SafeAreaProvider>,
  );
  return { report, source };
}

const reportSheet = () => (
  <ReportSheet target={{ id: 'user_copy', displayName: 'Test rider' }} context={null} onClose={jest.fn()} onPendingChange={jest.fn()} />
);

afterEach(async () => {
  await cleanup();
  disposers.splice(0).forEach((dispose) => dispose());
  jest.restoreAllMocks();
});

describe.each([['mock', demo], ['API', null]] as const)('%s presentation', (_mode, identity) => {
  it('labels synthetic riders only when the composed demo capability exists', async () => {
    await renderCopy(<LocationIntroScreen busy={false} onUseLocation={jest.fn()} onChooseArea={jest.fn()} />, identity);
    expect(screen.queryByText('Demo · synthetic riders') !== null).toBe(identity !== null);
    expect(screen.getByRole('button', { name: 'Choose an area instead' })).toBeEnabled();
  });

  it('labels the available catalogue without implying live geocoding', async () => {
    await renderCopy(<DestinationSheet open onChoose={jest.fn()} onClose={jest.fn()} />, identity);
    expect(await screen.findByText('There are no places to choose in this area.')).toBeOnTheScreen();
    expect(screen.getByText(identity
      ? 'Curated demo destinations. Search does not use a live places service.'
      : 'Curated test destinations. Search does not use a live places service.')).toBeOnTheScreen();
  });

  it('shows a correctly labelled receipt only after the source accepts', async () => {
    const { report } = await renderCopy(reportSheet(), identity);
    let accept!: (value: ReportReceiptDto) => void;
    report.mockReturnValue(new Promise((resolve) => { accept = resolve; }));
    const submit = identity ? 'Submit demo report' : 'Submit report';
    await userEvent.press(screen.getByRole('radio', { name: 'Harassment' }));
    await userEvent.press(screen.getByRole('button', { name: submit }));
    expect(screen.queryByText(/^(Demo receipt|Receipt):/)).toBeNull();
    await act(async () => { accept(receipt); });
    expect(await screen.findByRole('header', { name: identity ? 'Your demo report was received.' : 'Your report was received.' })).toBeOnTheScreen();
    expect(screen.getByText(`${identity ? 'Demo receipt' : 'Receipt'}: ${receipt.id}`)).toBeOnTheScreen();
    expect(screen.getByText(identity
      ? 'This confirms mock acceptance only. It does not mean a moderation decision was made.'
      : 'This confirms receipt only. It does not mean a moderation decision was made.')).toBeOnTheScreen();
  });

  it('does not label a missing walking estimate as an estimate', async () => {
    await renderCopy(<MeetingPointSheet point={{ id: 'point_copy', label: 'Test landmark', coordinates: { latitude: 42.87, longitude: 74.59 }, walkingMinutes: null }} openedId="point_copy" onReturn={jest.fn()} />, identity);
    expect(screen.getByText('Walking time not available')).toBeOnTheScreen();
    expect(screen.queryByText('Approximate demo estimate')).toBeNull();
    expect(screen.queryByText('Approximate estimate')).toBeNull();
  });

  it('labels a supplied walking estimate according to the composed capability', async () => {
    await renderCopy(<MeetingPointSheet point={{ id: 'point_copy', label: 'Test landmark', coordinates: { latitude: 42.87, longitude: 74.59 }, walkingMinutes: 4 }} openedId="point_copy" onReturn={jest.fn()} />, identity);
    expect(screen.getByText('About 4 min on foot')).toBeOnTheScreen();
    expect(screen.getByText(identity ? 'Approximate demo estimate' : 'Approximate estimate')).toBeOnTheScreen();
  });
});

it('keeps an unknown report outcome uncertain and retries the original intent', async () => {
  const { report } = await renderCopy(reportSheet(), null);
  report.mockRejectedValueOnce(new DataError('network', 'Lost response.')).mockResolvedValueOnce(receipt);
  await userEvent.press(screen.getByRole('radio', { name: 'Harassment' }));
  await userEvent.press(screen.getByRole('button', { name: 'Submit report' }));
  expect(await screen.findByRole('header', { name: 'Your report couldn’t be confirmed.' })).toBeOnTheScreen();
  expect(screen.getByText('The report may already have been accepted. Retry to check its status.')).toBeOnTheScreen();
  expect(screen.queryByText(/No receipt was issued/)).toBeNull();
  await userEvent.press(screen.getByRole('button', { name: 'Retry report' }));
  expect(await screen.findByText(`Receipt: ${receipt.id}`)).toBeOnTheScreen();
  expect(report.mock.calls[1]![0].operationId).toBe(report.mock.calls[0]![0].operationId);
});

it('uses source-neutral coverage wording', async () => {
  await renderCopy(<DiscoveryPanel state={{ kind: 'failed', unsupported: true }} onRetry={jest.fn()} onOpenList={jest.fn()} tileStatus="unknown" />, null);
  expect(screen.getByText('Outside the supported area')).toBeOnTheScreen();
  expect(screen.queryByText(/area the demo covers/)).toBeNull();
});

it('acknowledges an API OTP challenge without claiming an SMS was sent', async () => {
  const challenge = { id: 'challenge_copy', expiresAt: new Date(Date.now() + 300000).toISOString(), resendAvailableAt: new Date().toISOString() };
  const flow = { phoneNumber: demo.phoneNumber, challenge, setChallenge: jest.fn(), leave: jest.fn() };
  jest.spyOn(signInFlow, 'useSignInFlow').mockReturnValue(flow);
  const { source } = await renderCopy(<OtpScreen onChangeNumber={jest.fn()} />, null);
  source.auth.requestOtp = jest.fn(async () => challenge);
  expect(screen.getByText('Enter your verification code.')).toBeOnTheScreen();
  await userEvent.press(screen.getByRole('button', { name: 'Request a new code' }));
  expect(await screen.findByText('A new code is ready.')).toBeOnTheScreen();
  expect(screen.queryByText(/sent to your phone|A new code was sent/)).toBeNull();
});
