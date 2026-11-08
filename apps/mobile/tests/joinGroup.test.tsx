import { act, fireEvent, screen } from '@testing-library/react-native';
import type { NearbyItemDto } from '@ride-match/contracts';

import { DataError } from '../src/data/errors';
import { describeJoinError, describeJoinPlan } from '../src/features/groups/joinOutcome';
import {
  ANSWER_MS,
  anotherRider,
  captureSimulator,
  confirmJoiningAida,
  publishFromDraft,
  recordAnalytics,
  signInWithDemoCode,
  tapMarker,
  withActiveRequest,
} from './helpers/groupFlow';
import { BLOCKED, device, openHome, press, wait } from './helpers/locationDevice';
import { flushTimersAndRestore } from './helpers/renderApp';

describe('joining from a preview', () => {
  afterEach(async () => {
    await flushTimersAndRestore();
    jest.restoreAllMocks();
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'active-neighborhood';
  });

  it('confirms joining a solo rider and shows the group only once the source answers (12)', async () => {
    const events = recordAnalytics();
    await withActiveRequest();
    await confirmJoiningAida();

    expect(screen.getByRole('header', { name: 'Confirm joining' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Start a group together.' })).toBeOnTheScreen();
    expect(screen.getByText('You and Aida are heading towards Asia Mall.')).toBeOnTheScreen();
    expect(screen.getByText('2 people after joining')).toBeOnTheScreen();
    expect(screen.getByText('Aida becomes the coordinator')).toBeOnTheScreen();

    await press('Join Aida');
    // No optimistic membership: until the source answers, the request is still searching.
    expect(screen.queryByText('In a group')).not.toBeOnTheScreen();
    await wait(ANSWER_MS);

    // The group screen opens with the source's group: Aida coordinates, the rider is "You".
    expect(screen.getByRole('header', { name: 'Your group' })).toBeOnTheScreen();
    expect(screen.getByText('Forming · 2/4 people')).toBeOnTheScreen();
    expect(screen.getByText('Aida')).toBeOnTheScreen();
    expect(screen.getByText('You')).toBeOnTheScreen();
    await press('Back to map');
    expect(screen.queryByRole('header', { name: 'Confirm joining' })).not.toBeOnTheScreen();
    expect(screen.getByText('In a group')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Cancel request' })).not.toBeOnTheScreen();
    await press('Open my group');
    await wait(ANSWER_MS);
    expect(screen.getByRole('header', { name: 'Your group' })).toBeOnTheScreen();
    const joins = events().filter((event) => event.name.startsWith('group_join'));
    expect(joins).toEqual([
      expect.objectContaining({ name: 'group_join_clicked', properties: { kind: 'ride' } }),
      expect.objectContaining({ name: 'group_joined', properties: { kind: 'ride', memberCount: 2 } }),
    ]);
  });

  it('keeps the request active and shows the latest occupancy when the last seat goes first (29)', async () => {
    const captured = captureSimulator();
    await withActiveRequest();
    const simulator = captured.simulator!;
    const tsum = [...simulator.state.groups.values()].find((group) => group.status === 'forming')!;
    const other = await anotherRider(simulator, 99);
    // The group shares a cluster with another plan on the map, so it is opened from the list.
    await press('View nearby items');
    await act(async () => {
      fireEvent.press(screen.getAllByRole('button', { name: /^Group → TSUM/ })[0]!);
    });
    await wait(ANSWER_MS);
    await press('Plan to join this group');
    await wait(ANSWER_MS);
    expect(screen.getByText('4 people after joining')).toBeOnTheScreen();

    await press('Join this group');
    other.takeSeatMeanwhile(tsum.id);
    await wait(ANSWER_MS);

    expect(screen.getByText('Group is now full')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'That seat was just taken.' })).toBeOnTheScreen();
    expect(screen.getByText('The latest group has 4/4 people. Your own request is still active.')).toBeOnTheScreen();
    expect(tsum.members).toHaveLength(4);

    await press('Review my active request');
    expect(screen.getByText(/^Searching · /)).toBeOnTheScreen();
  });

  it('shows a group that filled up before the press as full, without sending a join', async () => {
    const captured = captureSimulator();
    const events = recordAnalytics();
    await withActiveRequest();
    const simulator = captured.simulator!;
    const tsum = [...simulator.state.groups.values()].find((group) => group.status === 'forming')!;
    const other = await anotherRider(simulator, 99);
    await press('View nearby items');
    await act(async () => {
      fireEvent.press(screen.getAllByRole('button', { name: /^Group → TSUM/ })[0]!);
    });
    await wait(ANSWER_MS);
    await press('Plan to join this group');
    await wait(ANSWER_MS);

    other.takeSeatMeanwhile(tsum.id);
    await wait(2 * ANSWER_MS);

    expect(screen.getByRole('header', { name: 'That seat was just taken.' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Join this group' })).not.toBeOnTheScreen();
    expect(events().filter((event) => event.name === 'group_join_clicked')).toEqual([]);
  });

  it('turns the confirmation into “that plan has changed” when the ride ends meanwhile (55)', async () => {
    await withActiveRequest();
    // Bakyt's request reaches its deadline 20 seconds after the scenario starts.
    await tapMarker(/^Bakyt → /);
    await wait(ANSWER_MS);
    await press('Plan to join this rider');
    await wait(ANSWER_MS);
    expect(screen.getByRole('button', { name: 'Join Bakyt' })).toBeOnTheScreen();

    await wait(20_000);

    expect(screen.getByRole('header', { name: 'That plan has changed.' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Join Bakyt' })).not.toBeOnTheScreen();
    await press('Refresh nearby plans');
    expect(screen.getByText(/^Searching · /)).toBeOnTheScreen();
  });

  it('finds a join whose answer was lost, without joining twice (30)', async () => {
    const captured = captureSimulator();
    await withActiveRequest();
    await confirmJoiningAida();
    const simulator = captured.simulator!;
    simulator.failNext({ kind: 'network', afterCommit: true }, 'groups.join');

    await press('Join Aida');
    await wait(ANSWER_MS);
    expect(screen.getByRole('header', { name: 'We’re checking what happened.' })).toBeOnTheScreen();

    await press('Check my request');
    await wait(2 * ANSWER_MS);

    expect(screen.getByRole('header', { name: 'Your group' })).toBeOnTheScreen();
    expect([...simulator.state.groups.values()].filter((group) => group.status === 'forming')).toHaveLength(2);
  });

  it('says a lost join did not happen, then retries the same operation (30)', async () => {
    const captured = captureSimulator();
    await withActiveRequest();
    await confirmJoiningAida();
    captured.simulator!.failNext({ kind: 'network' }, 'groups.join');

    await press('Join Aida');
    await wait(ANSWER_MS);
    await press('Check my request');
    await wait(ANSWER_MS);
    expect(
      screen.getByText('You haven’t joined: your request is not in a group, and no seat is held. You can retry now.'),
    ).toBeOnTheScreen();

    await press('Retry this join');
    await wait(ANSWER_MS);
    expect(screen.getByRole('header', { name: 'Your group' })).toBeOnTheScreen();
  });

  it('drafts the request a join needs after sign-in, then opens the confirmation once it is published', async () => {
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'active-neighborhood';
    device({ permission: BLOCKED });
    await openHome();
    await wait(ANSWER_MS);
    await tapMarker(/^Aida → Asia Mall, /);
    await wait(ANSWER_MS);
    await press('Plan to join this rider');
    await signInWithDemoCode();
    await wait(ANSWER_MS);
    expect(screen.getByRole('header', { name: 'When are you leaving?' })).toBeOnTheScreen();

    await publishFromDraft(false);

    expect(screen.getByRole('header', { name: 'Confirm joining' })).toBeOnTheScreen();
    await press('Join Aida');
    await wait(ANSWER_MS);
    expect(screen.getByRole('header', { name: 'Your group' })).toBeOnTheScreen();
  });
});

describe('join pieces', () => {
  const source = (code: string) =>
    new DataError('source', code, { body: { code: code as never, message: code, requestId: 'req_1' } });

  it('maps each refusal to what the rider can do next', () => {
    expect(describeJoinError(source('GROUP_FULL'))).toBe('full');
    expect(describeJoinError(source('GROUP_CLOSED'))).toBe('closed');
    expect(describeJoinError(source('TARGET_UNAVAILABLE'))).toBe('gone');
    expect(describeJoinError(source('BLOCKED_RELATIONSHIP'))).toBe('blocked');
    expect(describeJoinError(source('ALREADY_IN_GROUP'))).toBe('grouped');
    expect(describeJoinError(source('RIDE_EXPIRED'))).toBe('request-ended');
    expect(describeJoinError(source('INVALID_TRANSITION'))).toBe('request-ended');
    expect(describeJoinError(source('SESSION_EXPIRED'))).toBe('sign-in');
    expect(describeJoinError(source('SERVICE_UNAVAILABLE'))).toBe('unknown');
    expect(describeJoinError(new DataError('network', 'offline'))).toBe('unknown');
    expect(describeJoinError(source('FORBIDDEN'))).toBe('refused');
  });

  it('describes joining a group by its occupancy after the join', () => {
    const group = {
      kind: 'group',
      id: 'group_1',
      status: 'forming',
      memberCount: 3,
      capacity: 4,
      publicOrigin: { center: { latitude: 42.87, longitude: 74.6 }, radiusMeters: 900, label: null },
      destination: {
        id: 'place_tsum',
        label: 'TSUM',
        detail: null,
        coordinates: { latitude: 42.87, longitude: 74.61 },
      },
      departureAt: '2026-11-07T10:05:00.000Z',
      expiresAt: '2026-11-07T10:30:00.000Z',
      version: 2,
    } as NearbyItemDto;
    expect(describeJoinPlan(group, Date.parse('2026-11-07T10:00:00.000Z'))).toEqual({
      action: 'Join this group',
      headline: 'Join this group.',
      summary: 'The group is heading towards TSUM.',
      occupancy: '4 people after joining',
      departure: 'Leaving in 5 min',
      coordinator: null,
    });
  });
});
