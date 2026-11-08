import { screen, userEvent } from '@testing-library/react-native';

import { DataError } from '../src/data/errors';
import type { Simulator } from '../src/data/mock/simulator';
import type { MockWorld } from '../src/data/mock/world';
import { describeReportError, sameReport, toReportDetails } from '../src/features/safety/reportFlow';
import { ANSWER_MS, captureSimulator, recordAnalytics, signInWithDemoCode } from './helpers/groupFlow';
import { BLOCKED, device, openHome, press, wait } from './helpers/locationDevice';
import { flushTimersAndRestore } from './helpers/renderApp';

/** Scenario J: the demo rider signs in and opens their group with Aida and Bolot. */
async function openSafetyGroup() {
  const captured = captureSimulator();
  process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'safety';
  device({ permission: BLOCKED });
  await openHome();
  await press('Sign in');
  await signInWithDemoCode();
  await wait(ANSWER_MS);
  await press('Open my group');
  await wait(ANSWER_MS);
  const simulator: Simulator<MockWorld> = captured.simulator!;
  const group = [...simulator.state.groups.values()][0]!;
  return { simulator, group };
}

/** Picks a reason, a radio button in the form. */
async function choose(reason: string) {
  await userEvent.press(screen.getByRole('radio', { name: reason }));
}

async function openReportForBolot() {
  await press('More actions for Bolot');
  await press('Report Bolot');
}

describe('reporting a rider', () => {
  afterEach(async () => {
    await flushTimersAndRestore();
    jest.restoreAllMocks();
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'active-neighborhood';
  });

  it('files a report from the group and shows the receipt only after acceptance (41, 42)', async () => {
    const events = recordAnalytics();
    const { simulator, group } = await openSafetyGroup();
    await openReportForBolot();

    expect(screen.getByRole('header', { name: 'Tell us what happened.' })).toBeOnTheScreen();
    expect(screen.getByText('Reporting Bolot. Choose a reason.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Submit demo report' })).toBeDisabled();

    await choose('Harassment');
    expect(screen.getByRole('radio', { name: 'Harassment' })).toBeChecked();
    await userEvent.type(screen.getByLabelText('Details · optional'), '  Kept asking where I live.  ');
    await press('Submit demo report');
    // Nothing claims acceptance before the source answers.
    expect(screen.queryByText('Your demo report was received.')).not.toBeOnTheScreen();
    await wait(ANSWER_MS);

    expect(screen.getByRole('header', { name: 'Your demo report was received.' })).toBeOnTheScreen();
    const [report] = simulator.state.reports;
    expect(simulator.state.reports).toHaveLength(1);
    expect(report).toMatchObject({
      reason: 'harassment',
      details: 'Kept asking where I live.',
      context: { groupId: group.id, messageId: null },
    });
    expect(screen.getByText(`Demo receipt: ${report!.id}`)).toBeOnTheScreen();
    expect(screen.getByText(/does not mean a moderation decision was made\.$/)).toBeOnTheScreen();
    const reported = events().filter((event) => event.name === 'user_reported');
    expect(reported).toHaveLength(1);
    expect(reported[0]!.properties).toEqual({ reason: 'harassment' });
    expect(JSON.stringify(events())).not.toContain('where I live');
    // Reporting does not block.
    expect(simulator.state.blocks).toEqual([]);

    await press('Done');
    expect(screen.queryByRole('header', { name: 'Your demo report was received.' })).not.toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Your group' })).toBeOnTheScreen();
  });

  it('keeps the draft after a lost answer and retries under the same operation ID (52)', async () => {
    const { simulator } = await openSafetyGroup();
    await openReportForBolot();
    await choose('Unsafe behaviour');
    await userEvent.type(screen.getByLabelText('Details · optional'), 'Asked to meet somewhere else.');
    // Accepted, but the answer is lost on the way back.
    simulator.failNext({ kind: 'network', afterCommit: true }, 'safety.report');

    await press('Submit demo report');
    await wait(ANSWER_MS);

    expect(screen.getByRole('header', { name: 'Your report didn’t go through.' })).toBeOnTheScreen();
    expect(screen.getByText('Unsafe behaviour')).toBeOnTheScreen();
    expect(screen.queryByText(/^Demo receipt/)).not.toBeOnTheScreen();
    expect(simulator.state.reports).toHaveLength(1);

    // Editing keeps the draft; sending the same content is still the same report.
    await press('Edit report');
    expect(screen.getByLabelText('Details · optional').props.value).toBe('Asked to meet somewhere else.');
    expect(screen.getByRole('radio', { name: 'Unsafe behaviour' })).toBeChecked();
    simulator.failNext({ kind: 'network' }, 'safety.report');
    await press('Submit demo report');
    await wait(ANSWER_MS);
    await press('Retry report');
    await wait(ANSWER_MS);

    expect(screen.getByRole('header', { name: 'Your demo report was received.' })).toBeOnTheScreen();
    expect(simulator.state.reports).toHaveLength(1);
    expect(screen.getByText(`Demo receipt: ${simulator.state.reports[0]!.id}`)).toBeOnTheScreen();
  });

  it('reports a message from the chat with the message as context', async () => {
    const { simulator, group } = await openSafetyGroup();
    await press('Open group chat');
    await wait(2 * ANSWER_MS);
    const message = simulator.state.messages.get(group.id)!.find((entry) => entry.text.startsWith('Send me'))!;

    await press(/^Bolot · .*Send me your number/);
    await press('Report Bolot');
    expect(screen.getByText('Reporting Bolot · About their message. Choose a reason.')).toBeOnTheScreen();
    await choose('Spam or misleading information');
    await press('Submit demo report');
    await wait(ANSWER_MS);

    expect(screen.getByRole('header', { name: 'Your demo report was received.' })).toBeOnTheScreen();
    expect(simulator.state.reports[0]).toMatchObject({
      reason: 'spam_or_misleading',
      details: null,
      context: { groupId: group.id, messageId: message.id },
    });
  });
});

describe('report pieces', () => {
  it('normalizes details and leaves out empty ones', () => {
    expect(toReportDetails('  \r\n ')).toBeUndefined();
    expect(toReportDetails(' One\r\nTwo\tthree ')).toBe('One\nTwo three');
  });

  it('tells a true retry from an edited report', () => {
    const base = { targetUserId: 'user_1', reason: 'other' as const, context: { groupId: 'group_1', messageId: null } };
    expect(sameReport(base, { ...base })).toBe(true);
    expect(sameReport(base, { ...base, details: 'More' })).toBe(false);
    expect(sameReport(base, { ...base, reason: 'harassment' })).toBe(false);
    expect(sameReport(base, { ...base, context: { groupId: 'group_1', messageId: 'message_1' } })).toBe(false);
  });

  it('separates unknown outcomes from refusals', () => {
    const source = (code: string) => DataError.fromSource({ code, message: 'Refused.', requestId: 'request_1' });
    expect(describeReportError(new DataError('network', 'Lost.')).kind).toBe('unknown');
    expect(describeReportError(source('SERVICE_UNAVAILABLE')).kind).toBe('unknown');
    expect(describeReportError(source('VALIDATION_FAILED')).kind).toBe('rejected');
    expect(describeReportError(source('MEMBERSHIP_REQUIRED'))).toEqual({
      kind: 'rejected',
      message: 'You no longer have access to this group, so this report wasn’t sent.',
    });
  });
});
