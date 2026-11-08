import type { RideGroupDto } from '@ride-match/contracts';
import { screen, userEvent } from '@testing-library/react-native';

import { DataError } from '../src/data/errors';
import type { Simulator } from '../src/data/mock/simulator';
import type { MockWorld } from '../src/data/mock/world';
import { describeBlockConsequences, describeBlockError } from '../src/features/safety/blockFlow';
import { ANSWER_MS, captureSimulator, recordAnalytics, signInWithDemoCode } from './helpers/groupFlow';
import { BLOCKED, device, openHome, press, pressLast, wait } from './helpers/locationDevice';
import { flushTimersAndRestore } from './helpers/renderApp';

/** Scenario J: the demo rider signs in and opens their group with Aida (coordinator) and Bolot. */
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
  const demo = group.members.find(
    (entry) => simulator.state.users.get(entry.userId)?.displayName === 'Demo rider 123',
  )!;
  const bolot = [...simulator.state.users.values()].find((user) => user.displayName === 'Bolot')!;
  return { simulator, group, demoId: demo.userId, bolot };
}

async function openSettingsFromMap() {
  await press('Settings');
  await wait(ANSWER_MS);
}

describe('blocking a rider', () => {
  afterEach(async () => {
    await flushTimersAndRestore();
    jest.restoreAllMocks();
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'active-neighborhood';
  });

  it('confirms, blocks and leaves the shared group in one step (43)', async () => {
    const events = recordAnalytics();
    const { simulator, group, demoId, bolot } = await openSafetyGroup();
    await press('More actions for Bolot');
    await press('Block Bolot');

    expect(screen.getByRole('header', { name: 'Block and leave this group?' })).toBeOnTheScreen();
    expect(screen.getByText('You won’t be paired with this rider while signed in.')).toBeOnTheScreen();
    expect(screen.getByText(/blocking also removes you from it and cancels your request/)).toBeOnTheScreen();
    expect(
      screen.getByText('Other members stay in the group. The normal leave and coordinator rules still apply.'),
    ).toBeOnTheScreen();
    // Nothing is sent before the confirmation.
    expect(simulator.state.blocks).toEqual([]);

    await press('Block and leave');
    // Only the source's answer counts.
    expect(screen.getByRole('header', { name: 'Block and leave this group?' })).toBeOnTheScreen();
    await wait(ANSWER_MS);

    expect(simulator.state.blocks).toEqual([expect.objectContaining({ blockerId: demoId, blockedId: bolot.id })]);
    const after = simulator.state.groups.get(group.id)!;
    expect(after.members.map((entry) => entry.userId)).not.toContain(demoId);
    expect(after.members).toHaveLength(2);
    // Back on the map, with no private group screen left.
    expect(screen.queryByRole('header', { name: 'Your group' })).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeOnTheScreen();
    const blocked = events().filter((event) => event.name === 'user_blocked');
    expect(blocked).toHaveLength(1);
    expect(blocked[0]!.properties).toEqual({});
  });

  it('keeps the confirmation after a failed send and blocks once on retry', async () => {
    const { simulator, group, demoId } = await openSafetyGroup();
    await press('More actions for Bolot');
    await press('Block Bolot');
    simulator.failNext({ kind: 'network' }, 'safety.block');

    await press('Block and leave');
    await wait(ANSWER_MS);
    expect(screen.getByText('We couldn’t confirm the block. Try again; it won’t be applied twice.')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Block and leave this group?' })).toBeOnTheScreen();
    expect(simulator.state.blocks).toEqual([]);

    await press('Block and leave');
    await wait(ANSWER_MS);
    expect(simulator.state.blocks).toHaveLength(1);
    expect(simulator.state.groups.get(group.id)!.members.map((entry) => entry.userId)).not.toContain(demoId);
    expect(screen.queryByRole('header', { name: 'Block and leave this group?' })).not.toBeOnTheScreen();
  });

  it('ends access when the block lands but its answer is lost', async () => {
    const { simulator, group, demoId } = await openSafetyGroup();
    await press('More actions for Bolot');
    await press('Block Bolot');
    simulator.failNext({ kind: 'network', afterCommit: true }, 'safety.block');

    await press('Block and leave');
    await wait(ANSWER_MS);
    // The source's revocation arrives even though the answer was lost: the group's private view goes.
    expect(screen.getByRole('header', { name: 'Group unavailable' })).toBeOnTheScreen();
    expect(simulator.state.blocks).toHaveLength(1);
    expect(simulator.state.groups.get(group.id)!.members.map((entry) => entry.userId)).not.toContain(demoId);
  });

  it('goes back without blocking, and switches to the report form for the same rider', async () => {
    const { simulator } = await openSafetyGroup();
    await press('More actions for Bolot');
    await press('Block Bolot');
    await press('Report this rider');
    expect(screen.getByText('Reporting Bolot. Choose a reason.')).toBeOnTheScreen();
    await pressLast('Cancel');

    await press('More actions for Bolot');
    await press('Block Bolot');
    await press('Go back');
    expect(screen.queryByRole('header', { name: 'Block and leave this group?' })).not.toBeOnTheScreen();
    expect(simulator.state.blocks).toEqual([]);
  });

  it('offers the block from the report receipt (42)', async () => {
    const { simulator } = await openSafetyGroup();
    await press('More actions for Bolot');
    await press('Report Bolot');
    await userEvent.press(screen.getByRole('radio', { name: 'Harassment' }));
    await press('Submit demo report');
    await wait(ANSWER_MS);

    await press('Block this rider too');
    expect(screen.getByRole('header', { name: 'Block and leave this group?' })).toBeOnTheScreen();
    // The confirmation from the receipt doesn't offer to report again.
    expect(screen.queryByRole('button', { name: 'Report this rider' })).not.toBeOnTheScreen();
    await press('Block and leave');
    await wait(ANSWER_MS);
    expect(simulator.state.blocks).toHaveLength(1);
    expect(simulator.state.reports).toHaveLength(1);
  });

  it('blocks from the chat and ends access to it', async () => {
    const { simulator, group, demoId } = await openSafetyGroup();
    await press('Open group chat');
    await wait(2 * ANSWER_MS);
    await press(/^Bolot · .*Send me your number/);
    await press('Block Bolot');
    await press('Block and leave');
    await wait(ANSWER_MS);

    expect(simulator.state.blocks).toHaveLength(1);
    expect(simulator.state.groups.get(group.id)!.members.map((entry) => entry.userId)).not.toContain(demoId);
    expect(screen.queryByText(/Send me your number/)).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeOnTheScreen();
  });
});

describe('blocked riders (44)', () => {
  afterEach(async () => {
    await flushTimersAndRestore();
    jest.restoreAllMocks();
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'active-neighborhood';
  });

  it('lists the block, unblocks, and restores no membership or chat', async () => {
    const { simulator, group, demoId } = await openSafetyGroup();
    await press('More actions for Bolot');
    await press('Block Bolot');
    await press('Block and leave');
    await wait(ANSWER_MS);

    await openSettingsFromMap();
    await press('Blocked riders');
    await wait(ANSWER_MS);
    expect(screen.getByText('People you’ve blocked.')).toBeOnTheScreen();
    expect(screen.getByText('Bolot')).toBeOnTheScreen();
    expect(screen.getByText('Blocked in this demo')).toBeOnTheScreen();
    expect(screen.getByText(/does not restore group membership or access to old chat\.$/)).toBeOnTheScreen();

    await press('Unblock Bolot');
    await wait(ANSWER_MS);
    expect(simulator.state.blocks).toEqual([]);
    expect(screen.getByText('You unblocked Bolot.')).toBeOnTheScreen();
    expect(screen.getByText('You haven’t blocked anyone.')).toBeOnTheScreen();
    // Unblocking restores nothing: the rider is still out of the group they left.
    expect(simulator.state.groups.get(group.id)!.members.map((entry) => entry.userId)).not.toContain(demoId);
  });

  it('pages a long list, and keeps a failed unblock on its row', async () => {
    const { simulator, demoId } = await openSafetyGroup();
    // Synthetic riders blocked earlier, one second apart.
    for (let n = 1; n <= 23; n += 1) {
      const id = `usr_blocktest${String(n).padStart(2, '0')}`;
      simulator.state.users.set(id, { id, displayName: `Rider ${n}`, avatarUrl: null });
      simulator.state.blocks.push({ blockerId: demoId, blockedId: id, blockedAt: Date.now() - (100 - n) * 1000 });
    }
    await press('Back to map');
    await openSettingsFromMap();
    await press('Blocked riders');
    await wait(ANSWER_MS);

    expect(screen.getByText('Rider 23')).toBeOnTheScreen();
    expect(screen.queryByText('Rider 3')).not.toBeOnTheScreen();
    await press('Load more blocked riders');
    await wait(ANSWER_MS);
    expect(screen.getByText('Rider 1')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Load more blocked riders' })).not.toBeOnTheScreen();

    simulator.failNext({ kind: 'network' }, 'safety.unblock');
    await press('Unblock Rider 5');
    await wait(ANSWER_MS);
    expect(screen.getByText('Rider 5 couldn’t be unblocked. Try again.')).toBeOnTheScreen();
    expect(simulator.state.blocks).toHaveLength(23);
  });

  it('shows no block list row to an anonymous viewer', async () => {
    captureSimulator();
    device({ permission: BLOCKED });
    await openHome();
    await press('Settings');
    expect(screen.queryByRole('button', { name: 'Blocked riders' })).not.toBeOnTheScreen();
  });
});

describe('block pieces', () => {
  const user = (id: string, displayName: string) => ({ id, displayName, avatarUrl: null });
  const groupOf = (status: RideGroupDto['status'], ids: string[], coordinatorId = ids[0]!) =>
    ({
      status,
      coordinatorId,
      members: ids.map((id) => ({ user: user(id, id) })),
    }) as unknown as RideGroupDto;
  const target = { id: 'usr_b', displayName: 'Bolot' };

  it('words the two-person, coordinator, closed and unshared cases', () => {
    expect(describeBlockConsequences(groupOf('forming', ['usr_a', 'usr_b']), 'usr_a', target)).toMatchObject({
      leaves: true,
      detail: 'Only the two of you are in this group, so it closes when you leave.',
      confirmLabel: 'Block and leave',
    });
    expect(describeBlockConsequences(groupOf('ready', ['usr_a', 'usr_b', 'usr_c']), 'usr_a', target).detail).toBe(
      'Other members stay in the group, and the earliest remaining member becomes coordinator.',
    );
    expect(describeBlockConsequences(groupOf('cancelled', ['usr_a', 'usr_b']), 'usr_a', target)).toEqual({
      leaves: false,
      title: 'Block Bolot?',
      message: 'You won’t be paired with this rider while signed in.',
      warning: null,
      detail: 'This closed group isn’t changed. Its read-only history stays until it expires.',
      confirmLabel: 'Block Bolot',
    });
    expect(describeBlockConsequences(null, 'usr_a', target)).toMatchObject({ leaves: false, detail: null });
  });

  it('tells an unknown outcome from a refusal', () => {
    const source = (code: string) => DataError.fromSource({ code, message: 'Refused.', requestId: 'request_1' });
    expect(describeBlockError(new DataError('network', 'Lost.')).kind).toBe('unknown');
    expect(describeBlockError(source('SERVICE_UNAVAILABLE')).kind).toBe('unknown');
    expect(describeBlockError(source('VALIDATION_FAILED')).kind).toBe('rejected');
    expect(describeBlockError(source('SESSION_EXPIRED')).kind).toBe('rejected');
  });
});
