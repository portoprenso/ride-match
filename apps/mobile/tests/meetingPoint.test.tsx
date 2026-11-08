import { screen, within } from '@testing-library/react-native';

import { MEETING_POINT_DELAY_MS, replaceMeetingPoint, withdrawMeetingPoint } from '../src/data/mock/meetingPoints';
import { describeWalk } from '../src/features/groups/MeetingPointSheet';
import { ANSWER_MS, coordinatedGroup, recordAnalytics } from './helpers/groupFlow';
import { press, wait } from './helpers/locationDevice';
import { flushTimersAndRestore } from './helpers/renderApp';

/** Lets the source's scheduled point arrive (10 s after the group formed) and the screen reread it. */
async function awaitSuggestedPoint() {
  for (let second = 0; second < MEETING_POINT_DELAY_MS / 1000; second += 1) await wait(1000);
  await wait(2 * ANSWER_MS);
}

describe('the meeting point', () => {
  afterEach(async () => {
    await flushTimersAndRestore();
    jest.restoreAllMocks();
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'active-neighborhood';
  });

  it('says a point is coming, then shows the suggested one with the viewer’s estimate (33)', async () => {
    const { group } = await coordinatedGroup({ meetingPoint: false });

    expect(screen.getByText('A meeting point is coming.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Refresh group' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Mark group ready' })).toBeDisabled();

    await awaitSuggestedPoint();

    expect(screen.getByText('A meeting point was suggested.')).toBeOnTheScreen();
    expect(screen.getByText(group.meetingPoint!.label)).toBeOnTheScreen();
    expect(screen.getByText(/^Suggested meeting point · About \d+ min on foot$/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Mark group ready' })).toBeEnabled();
  });

  it('opens the member-only map sheet, and returning changes nothing (15)', async () => {
    const events = recordAnalytics();
    const { group } = await coordinatedGroup({ meetingPoint: false });
    await awaitSuggestedPoint();
    const version = group.version;

    await press('View meeting point');

    expect(screen.getByTestId('meeting-point-map')).toBeOnTheScreen();
    expect(screen.getByLabelText(`Meeting point: ${group.meetingPoint!.label}`)).toBeOnTheScreen();
    expect(screen.getByText('Members only')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: group.meetingPoint!.label })).toBeOnTheScreen();
    expect(screen.getByText(/^About \d+ min on foot$/)).toBeOnTheScreen();
    expect(screen.getByText('Approximate demo estimate')).toBeOnTheScreen();
    expect(events().filter((event) => event.name === 'meeting_point_viewed')).toHaveLength(1);

    await press('Return to group');
    expect(screen.queryByTestId('meeting-point-map')).not.toBeOnTheScreen();
    expect(group).toMatchObject({ status: 'forming', version });
  });

  it('shows a replaced point in the open sheet, and the ready group forming again', async () => {
    const captured = await coordinatedGroup({ meetingPoint: false });
    const { simulator, group } = captured;
    await awaitSuggestedPoint();
    await press('Mark group ready');
    await wait(ANSWER_MS);
    const first = group.meetingPoint!;
    await press('View meeting point');

    simulator.schedule(0, (context) => replaceMeetingPoint(context, group.id));
    await wait(2 * ANSWER_MS);

    const map = screen.getByTestId('meeting-point-map');
    expect(within(map).getByLabelText(`Meeting point: ${group.meetingPoint!.label}`)).toBeOnTheScreen();
    expect(group.meetingPoint!.id).not.toBe(first.id);
    expect(screen.getByText('The meeting point changed. This is the new suggested place.')).toBeOnTheScreen();
    await press('Return to group');
    expect(
      screen.getByText(
        'The meeting point changed. Check it before the group is marked ready. The group is forming again.',
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText('Forming · 2/4 people')).toBeOnTheScreen();
  });

  it('says a withdrawn point is gone, and readiness waits for a new one', async () => {
    const { simulator, group } = await coordinatedGroup({ meetingPoint: false });
    await awaitSuggestedPoint();
    await press('View meeting point');

    simulator.schedule(0, (context) => withdrawMeetingPoint(context, group.id));
    await wait(2 * ANSWER_MS);

    expect(screen.getByRole('header', { name: 'The meeting point was withdrawn.' })).toBeOnTheScreen();
    await press('Return to group');
    expect(screen.getByText('A meeting point is coming.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Mark group ready' })).toBeDisabled();
  });
});

describe('meeting point pieces', () => {
  it('words the supplied estimate, or none', () => {
    expect(describeWalk({ walkingMinutes: 4 })).toBe('About 4 min on foot');
    expect(describeWalk({ walkingMinutes: 0 })).toBe('About 1 min on foot');
    expect(describeWalk({ walkingMinutes: null })).toBeNull();
  });
});
