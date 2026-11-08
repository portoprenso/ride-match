import { act, fireEvent, screen, userEvent } from '@testing-library/react-native';
import type { NearbyItemDto } from '@ride-match/contracts';

import * as sinks from '../src/analytics/sinks';
import { createMemorySink } from '../src/analytics/sinks';
import { DataError } from '../src/data/errors';
import { DEMO_OTP_CODE } from '../src/data/mock/auth';
import * as mockSource from '../src/data/mock/createMockDataSource';
import type { Simulator } from '../src/data/mock/simulator';
import type { MockWorld } from '../src/data/mock/world';
import { joinGroup } from '../src/data/mock/groups';
import { describeJoinError, describeJoinPlan } from '../src/features/groups/joinOutcome';
import { BLOCKED, device, openHome, press, wait } from './helpers/locationDevice';
import { flushTimersAndRestore } from './helpers/renderApp';

// Longer than the mock source's largest simulated latency.
const ANSWER_MS = 1000;
const SEARCH_MS = 300 + ANSWER_MS;

function recordAnalytics() {
  const sink = createMemorySink();
  jest.spyOn(sinks, 'selectAnalyticsSink').mockReturnValue(sink);
  return () => sink.events();
}

/** Keeps the simulator the app composes, to queue failures and act as another rider. */
function captureSimulator() {
  const original = mockSource.createMockSimulator;
  const captured: { simulator: Simulator<MockWorld> | null } = { simulator: null };
  jest.spyOn(mockSource, 'createMockSimulator').mockImplementation((...args) => {
    captured.simulator = original(...args);
    return captured.simulator;
  });
  return captured;
}

/** Taps the discovery marker whose label matches, as a rider taps a pill on the map. */
async function tapMarker(name: RegExp) {
  const marker = screen.getAllByLabelText(name).find((node) => node.props.testID === 'map-marker')!;
  await act(async () => {
    fireEvent.press(marker);
  });
}

/** From the draft's departure step: a named pickup, sign-in when asked, publish. */
async function publishFromDraft(signIn: boolean) {
  await press('Choose a named place');
  await wait(SEARCH_MS);
  await press('Ala-Too Square, City square');
  await press('Confirm this pickup');
  if (signIn) {
    await press('Continue to sign in');
    await signInWithDemoCode();
  } else {
    await press('Review my request');
  }
  await press('Publish my request');
  await wait(ANSWER_MS);
}

async function signInWithDemoCode() {
  await press('Continue with demo identity');
  await wait(ANSWER_MS);
  await userEvent.type(screen.getByLabelText('Demo code'), '123456');
  await press('Verify demo code');
  await wait(ANSWER_MS);
}

/** Scenario A, with the rider's own active request to Asia Mall already published. */
async function withActiveRequest() {
  process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'active-neighborhood';
  device({ permission: BLOCKED });
  await openHome();
  await wait(ANSWER_MS);
  await press('Choose a destination');
  await userEvent.type(screen.getByLabelText('Destination'), 'Asia');
  await wait(SEARCH_MS);
  await press('Asia Mall, Shopping centre');
  await wait(ANSWER_MS);
  await press('Create my ride request');
  await publishFromDraft(true);
  expect(screen.getByText(/^Searching · /)).toBeOnTheScreen();
}

/** Opens Aida's preview and the confirmation for joining her. */
async function confirmJoiningAida() {
  await tapMarker(/^Aida → Asia Mall, /);
  await wait(ANSWER_MS);
  await press('Plan to join this rider');
  await wait(ANSWER_MS);
}

/**
 * Another synthetic rider with an active request on the same source, ready to take a seat. The
 * seat is taken by a task due at once, which the source runs just before the next operation's
 * work: so it lands while the rider's own join is on its way, as scenario E describes.
 */
async function anotherRider(simulator: Simulator<MockWorld>) {
  const session = { accessToken: null as string | null };
  const other = mockSource.createMockDataSource(simulator, { accessToken: () => session.accessToken });
  const settle = async <Value,>(call: Promise<Value>) => {
    await wait(ANSWER_MS);
    return call;
  };
  const challenge = await settle(other.auth.requestOtp({ phoneNumber: '+447700900199' }));
  const signedIn = await settle(other.auth.verifyOtp({ challengeId: challenge.id, code: DEMO_OTP_CODE }));
  session.accessToken = signedIn.accessToken;
  const ride = await settle(
    other.rides.create({
      operationId: '00000000-0000-4000-8000-000000000999',
      origin: { source: 'manual', coordinates: { latitude: 42.8746, longitude: 74.6122 } },
      destinationPlaceId: 'place_tsum',
      departureOffsetMinutes: 5,
    }),
  );
  return {
    takeSeatMeanwhile: (groupId: string) =>
      simulator.schedule(0, (context) => {
        joinGroup(context, signedIn.accessToken, {
          operationId: '00000000-0000-4000-8000-000000000998',
          rideRequestId: ride.id,
          target: { kind: 'group', id: groupId },
        });
      }),
  };
}

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

    expect(screen.queryByRole('header', { name: 'Confirm joining' })).not.toBeOnTheScreen();
    expect(screen.getByText('In a group')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Cancel request' })).not.toBeOnTheScreen();
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
    const other = await anotherRider(simulator);
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
    const other = await anotherRider(simulator);
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

    expect(screen.getByText('In a group')).toBeOnTheScreen();
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
    expect(screen.getByText('In a group')).toBeOnTheScreen();
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
    expect(screen.getByText('In a group')).toBeOnTheScreen();
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
