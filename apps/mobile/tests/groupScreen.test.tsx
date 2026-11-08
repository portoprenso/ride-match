import { act, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { RideGroupDto } from '@ride-match/contracts';

import { describeGroup, describeGroupTimes } from '../src/features/groups/GroupScreen';
import { ANSWER_MS, anotherRider, captureSimulator, confirmJoiningAida, withActiveRequest } from './helpers/groupFlow';
import { press, wait } from './helpers/locationDevice';
import { flushTimersAndRestore } from './helpers/renderApp';

/** Joins Aida from her preview and lands on the group screen. */
async function joinAida() {
  await confirmJoiningAida();
  await press('Join Aida');
  await wait(ANSWER_MS);
  expect(screen.getByRole('header', { name: 'Your group' })).toBeOnTheScreen();
}

describe('the group screen', () => {
  afterEach(async () => {
    await flushTimersAndRestore();
    jest.restoreAllMocks();
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'active-neighborhood';
  });

  it('follows occupancy live from 2 to 4, and a full group is still forming (13, 32)', async () => {
    const captured = captureSimulator();
    await withActiveRequest();
    const simulator = captured.simulator!;
    const third = await anotherRider(simulator, 21);
    const fourth = await anotherRider(simulator, 22);
    await joinAida();

    expect(screen.getByText('Forming · 2/4 people')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Asia Mall, together.' })).toBeOnTheScreen();
    expect(screen.getByText('Two seats still open')).toBeOnTheScreen();
    expect(screen.getByText(/^Coordinator( · Demo profile)?$/)).toBeOnTheScreen();
    expect(
      screen.getByText(/^Agree on the meeting point in chat\. Aida will mark the group ready\.$/),
    ).toBeOnTheScreen();
    const aida = [...simulator.state.users.values()].find((user) => user.displayName === 'Aida')!;
    const groupId = [...simulator.state.rides.values()].find((ride) => ride.userId === aida.id)!.groupId!;

    third.takeSeat({ kind: 'group', id: groupId });
    await wait(2 * ANSWER_MS);
    expect(screen.getByText('Forming · 3/4 people')).toBeOnTheScreen();
    expect(screen.getByText('One seat still open')).toBeOnTheScreen();

    fourth.takeSeat({ kind: 'group', id: groupId });
    await wait(2 * ANSWER_MS);
    expect(screen.getByText('Forming · 4/4 people')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Everyone’s here.' })).toBeOnTheScreen();
    expect(screen.getByText('Full does not automatically mean ready.')).toBeOnTheScreen();
    expect(screen.queryByText(/still open$/)).not.toBeOnTheScreen();
  });

  it('opens a menu that names the member it acts on, and none for the viewer', async () => {
    await withActiveRequest();
    await joinAida();

    expect(screen.queryByRole('button', { name: /^More actions for You/ })).not.toBeOnTheScreen();
    await press('More actions for Aida');

    expect(screen.getByRole('header', { name: 'Aida' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Report Aida' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Block Aida' })).toBeEnabled();
    await press('Close');
    expect(screen.queryByRole('button', { name: 'Report Aida' })).not.toBeOnTheScreen();
  });

  it('shows the coordinator view to a rider whose ride someone else joined', async () => {
    const captured = captureSimulator();
    await withActiveRequest();
    const simulator = captured.simulator!;
    // The rider's own request: the only active one by a demo account rather than a seeded rider.
    const demoUsers = [...simulator.state.users.values()].filter((user) => user.displayName.startsWith('Demo rider'));
    const mine = [...simulator.state.rides.values()].find(
      (ride) => ride.status === 'active' && demoUsers.some((user) => user.id === ride.userId),
    )!;
    const joiner = await anotherRider(simulator, 23);

    joiner.takeSeat({ kind: 'ride', id: mine.id });
    await wait(2 * ANSWER_MS);
    expect(screen.getByText('In a group')).toBeOnTheScreen();

    await press('Open my group');
    await wait(ANSWER_MS);
    expect(screen.getByRole('header', { name: 'Your group · coordinator' })).toBeOnTheScreen();
    expect(screen.getByText('Confirm the shared meeting point in chat, then mark the group ready.')).toBeOnTheScreen();
  });

  it('rejects a signed-in rider who opens a group they are not in, revealing nothing', async () => {
    const captured = captureSimulator();
    await withActiveRequest();
    const forming = [...captured.simulator!.state.groups.values()].find((group) => group.status === 'forming')!;

    await act(async () => router.push({ pathname: '/groups/[groupId]', params: { groupId: forming.id } }));
    await wait(ANSWER_MS);

    expect(screen.getByRole('header', { name: 'Group unavailable' })).toBeOnTheScreen();
    expect(screen.queryByText(/Gulnara|Ilyas|Jyldyz|TSUM/)).not.toBeOnTheScreen();
    await press('Go to map');
    expect(screen.getByText(/^Searching · /)).toBeOnTheScreen();
  });
});

describe('group pieces', () => {
  const member = (id: string, name: string) => ({
    user: { id, displayName: name, avatarUrl: null },
    joinedAt: '2026-11-08T10:00:00.000Z',
    rideRequestId: `ride_${id}`,
  });
  const group = (members: number): RideGroupDto => ({
    id: 'group_1',
    status: 'forming',
    coordinatorId: 'u1',
    members: [member('u1', 'Aida'), member('u2', 'Bakyt'), member('u3', 'Cholpon'), member('u4', 'Daniyar')].slice(
      0,
      members,
    ),
    capacity: 4,
    destination: { id: 'place_tsum', label: 'TSUM', detail: null, coordinates: { latitude: 42.87, longitude: 74.61 } },
    departureAt: '2026-11-08T10:05:00.000Z',
    meetingPoint: null,
    createdAt: '2026-11-08T10:00:00.000Z',
    expiresAt: '2026-11-08T10:30:00.000Z',
    closure: null,
    version: 1,
  });

  it('counts occupancy from the members and words it by role', () => {
    expect(describeGroup(group(3), 'u2')).toEqual({
      badge: 'Forming · 3/4 people',
      headline: 'TSUM, together.',
      note: null,
      openSeats: 'One seat still open',
      viewerIsCoordinator: false,
      nextStep: 'Agree on the meeting point in chat. Aida will mark the group ready.',
    });
    expect(describeGroup(group(4), 'u1')).toMatchObject({
      badge: 'Forming · 4/4 people',
      headline: 'Everyone’s here.',
      note: 'Full does not automatically mean ready.',
      openSeats: null,
      viewerIsCoordinator: true,
    });
    expect(describeGroupTimes(group(2), Date.parse('2026-11-08T10:02:00.000Z'))).toBe(
      'Leaving in about 3 min · Group closes in 28 min',
    );
  });
});
