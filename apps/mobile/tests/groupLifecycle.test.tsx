import { act, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { RideGroupDto } from '@ride-match/contracts';

import { leaveGroup } from '../src/data/mock/groups';
import { DataError } from '../src/data/errors';
import { describeActionError, describeClosure, groupControls } from '../src/features/groups/groupLifecycle';
import {
  ANSWER_MS,
  actAs,
  anotherRider,
  appRider,
  captureSimulator,
  confirmJoiningAida,
  coordinatedGroup,
  recordAnalytics,
  withActiveRequest,
} from './helpers/groupFlow';
import { press, pressLast, wait } from './helpers/locationDevice';
import { flushTimersAndRestore } from './helpers/renderApp';

const LEAVE_ID = '00000000-0000-4000-8000-000000000700';

describe('the coordinator’s controls', () => {
  afterEach(async () => {
    await flushTimersAndRestore();
    jest.restoreAllMocks();
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'active-neighborhood';
  });

  it('keeps “Mark group ready” disabled without a meeting point', async () => {
    await coordinatedGroup({ meetingPoint: false });

    expect(screen.getByRole('button', { name: 'Mark group ready' })).toBeDisabled();
    expect(
      screen.getByText(
        'Readiness needs at least two people and a shared meeting point. A full group alone is not enough.',
      ),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Cancel group' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Leave group' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Mark group complete' })).not.toBeOnTheScreen();
  });

  it('marks the group ready, reopens it, and completes it with everyone’s requests (49, 18)', async () => {
    const events = recordAnalytics();
    const { group } = await coordinatedGroup({ meetingPoint: true });

    await press('Mark group ready');
    await wait(ANSWER_MS);
    expect(screen.getByText('Ready · 2/4 people')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Ready to head out.' })).toBeOnTheScreen();
    expect(screen.getByText(/^Agreed shared pickup/)).toBeOnTheScreen();
    expect(group.status).toBe('ready');

    await press('Reopen group for joining');
    await wait(ANSWER_MS);
    expect(screen.getByText('Forming · 2/4 people')).toBeOnTheScreen();

    await press('Mark group ready');
    await wait(ANSWER_MS);
    await press('Mark group complete');
    // Completing ends the request, which unmounts the home card's one-second clock. Passing the
    // answer's time in one step then crashes Jest's fake timers (`callAt`), as in RIDE-001-C, so
    // the time passes in short steps.
    for (let step = 0; step < 10; step += 1) await wait(ANSWER_MS / 10);

    expect(screen.getByRole('header', { name: 'Group completed' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Thanks for going along.' })).toBeOnTheScreen();
    expect(screen.getByText(/^Group closed at /)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Leave group' })).not.toBeOnTheScreen();
    expect(events().filter((event) => event.name === 'ride_completed')).toEqual([
      expect.objectContaining({ properties: { memberCount: 2 } }),
    ]);

    await press('Back to the map');
    // The request completed with the group: the card has nothing left to show.
    expect(screen.queryByText('In a group')).not.toBeOnTheScreen();
    expect(screen.queryByText(/^Searching · /)).not.toBeOnTheScreen();
  });

  it('asks before cancelling the group for everyone (51)', async () => {
    const { group, joiner } = await coordinatedGroup({ meetingPoint: false });

    await press('Cancel group');
    expect(screen.getByRole('header', { name: 'Close the group for everyone?' })).toBeOnTheScreen();
    await press('Keep group');
    expect(group.status).toBe('forming');

    await press('Cancel group');
    await press('Cancel group for everyone');
    await wait(ANSWER_MS);

    expect(screen.getByRole('header', { name: 'Group cancelled' })).toBeOnTheScreen();
    expect(group.closure?.reason).toBe('coordinator_cancelled');
    expect(joiner.rideId).toBeDefined();
  });

  it('rereads the group when it changed before the press, instead of applying an old view', async () => {
    const { group } = await coordinatedGroup({ meetingPoint: true });
    // A change the screen has not heard of yet.
    group.version += 1;

    await press('Mark group ready');
    await wait(2 * ANSWER_MS);

    expect(screen.getByText('The group changed. Check it, then try again.')).toBeOnTheScreen();
    expect(group.status).toBe('forming');
    await press('Mark group ready');
    await wait(ANSWER_MS);
    expect(group.status).toBe('ready');
  });
});

describe('leaving and losing access', () => {
  afterEach(async () => {
    await flushTimersAndRestore();
    jest.restoreAllMocks();
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'active-neighborhood';
  });

  it('confirms leaving, cancels the request and ends access at once (34)', async () => {
    const events = recordAnalytics();
    const captured = captureSimulator();
    await withActiveRequest();
    await confirmJoiningAida();
    await press('Join Aida');
    await wait(ANSWER_MS);
    const groupId = captured.simulator!.state.rides.get(
      [...captured.simulator!.state.rides.values()].find((ride) => ride.userId === appRider(captured.simulator!))!.id,
    )!.groupId!;

    await press('Leave group');
    expect(screen.getByRole('header', { name: 'Leave this group?' })).toBeOnTheScreen();
    await pressLast('Leave group');
    for (let step = 0; step < 10; step += 1) await wait(ANSWER_MS / 10);

    expect(screen.getByTestId('home-map')).toBeOnTheScreen();
    expect(screen.queryByText('In a group')).not.toBeOnTheScreen();
    expect(events().map((event) => event.name)).toEqual(expect.arrayContaining(['group_leave_clicked', 'group_left']));

    await act(async () => router.push({ pathname: '/groups/[groupId]', params: { groupId } }));
    await wait(ANSWER_MS);
    expect(screen.getByRole('header', { name: 'Group unavailable' })).toBeOnTheScreen();
    expect(screen.queryByText('Aida')).not.toBeOnTheScreen();
  });

  it('tells a member who becomes coordinator because the coordinator left (35)', async () => {
    const captured = captureSimulator();
    await withActiveRequest();
    const simulator = captured.simulator!;
    const third = await anotherRider(simulator, 32);
    await confirmJoiningAida();
    await press('Join Aida');
    await wait(ANSWER_MS);
    const aida = [...simulator.state.users.values()].find((user) => user.displayName === 'Aida')!;
    const groupId = [...simulator.state.rides.values()].find((ride) => ride.userId === aida.id)!.groupId!;
    third.takeSeat({ kind: 'group', id: groupId });
    await wait(2 * ANSWER_MS);
    expect(screen.getByText('Forming · 3/4 people')).toBeOnTheScreen();

    const asAida = await actAs(simulator, aida.id, '+447700900260');
    asAida.act((context, token) => leaveGroup(context, token, groupId, { operationId: LEAVE_ID }));
    await wait(2 * ANSWER_MS);

    expect(screen.getByText('A member has left. You’re now the coordinator.')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Your group · coordinator' })).toBeOnTheScreen();
    expect(screen.getByText('Forming · 2/4 people')).toBeOnTheScreen();
  });

  it('clears the group when the source says the viewer is no longer a member (37)', async () => {
    const captured = captureSimulator();
    await withActiveRequest();
    const simulator = captured.simulator!;
    await confirmJoiningAida();
    await press('Join Aida');
    await wait(ANSWER_MS);
    const mine = [...simulator.state.rides.values()].find((ride) => ride.userId === appRider(simulator))!;
    // The rider left on another device; this screen has not heard of it.
    const elsewhere = await actAs(simulator, appRider(simulator), '+447700900261');
    elsewhere.act((context, token) => leaveGroup(context, token, mine.groupId!, { operationId: LEAVE_ID }));
    await wait(ANSWER_MS);
    expect(screen.getByText('Aida')).toBeOnTheScreen();

    await press('Leave group');
    await pressLast('Leave group');
    for (let step = 0; step < 20; step += 1) await wait(ANSWER_MS / 10);

    expect(screen.getByRole('header', { name: 'Group unavailable' })).toBeOnTheScreen();
    expect(screen.getByText(/^You no longer have access\./)).toBeOnTheScreen();
    expect(screen.queryByText('Aida')).not.toBeOnTheScreen();
  });
});

describe('lifecycle pieces', () => {
  const group = (overrides: Partial<RideGroupDto>): RideGroupDto =>
    ({
      id: 'group_1',
      status: 'forming',
      coordinatorId: 'u1',
      members: [],
      capacity: 4,
      meetingPoint: null,
      closure: null,
      ...overrides,
    }) as RideGroupDto;

  it('offers controls by role and status', () => {
    expect(groupControls(group({}), 'u2')).toEqual({ changes: [], needsPoint: false, canLeave: true });
    expect(groupControls(group({}), 'u1')).toEqual({ changes: ['cancelled'], needsPoint: true, canLeave: true });
    expect(groupControls(group({ status: 'ready' }), 'u1').changes).toEqual(['forming', 'completed', 'cancelled']);
    expect(groupControls(group({ status: 'completed' }), 'u1')).toEqual({
      changes: [],
      needsPoint: false,
      canLeave: false,
    });
  });

  it('maps refusals to reread, retry or revoked, and names closures without blame', () => {
    const source = (code: string) =>
      new DataError('source', code, { body: { code: code as never, message: code, requestId: 'req_1' } });
    expect(describeActionError(source('VERSION_CONFLICT')).kind).toBe('reread');
    expect(describeActionError(source('MEMBERSHIP_REQUIRED')).kind).toBe('revoked');
    expect(describeActionError(new DataError('network', 'offline')).kind).toBe('retry');
    const closed = (reason: 'members_left' | 'expired') =>
      describeClosure(group({ status: 'cancelled', closure: { reason, closedAt: '', historyExpiresAt: '' } }));
    expect(closed('members_left').body).toBe('Everyone else left, so the group couldn’t continue.');
    expect(closed('expired').headline).toBe('This group expired.');
  });
});
