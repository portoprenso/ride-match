import { act, fireEvent, screen, userEvent } from '@testing-library/react-native';

import * as sinks from '../../src/analytics/sinks';
import { createMemorySink } from '../../src/analytics/sinks';
import { DEMO_OTP_CODE } from '../../src/data/mock/auth';
import * as mockSource from '../../src/data/mock/createMockDataSource';
import { joinGroup } from '../../src/data/mock/groups';
import type { Simulator } from '../../src/data/mock/simulator';
import type { MockWorld } from '../../src/data/mock/world';
import { BLOCKED, device, openHome, press, wait } from './locationDevice';

/*
 * Shared steps for route tests of joining and groups (GROUP-002): publishing the rider's own
 * request in scenario A, opening a preview, and acting as other synthetic riders on the same
 * simulator.
 */

// Longer than the mock source's largest simulated latency.
export const ANSWER_MS = 1000;
export const SEARCH_MS = 300 + ANSWER_MS;

export function recordAnalytics() {
  const sink = createMemorySink();
  jest.spyOn(sinks, 'selectAnalyticsSink').mockReturnValue(sink);
  return () => sink.events();
}

/** Keeps the simulator the app composes, to queue failures and act as another rider. */
export function captureSimulator() {
  const original = mockSource.createMockSimulator;
  const captured: { simulator: Simulator<MockWorld> | null } = { simulator: null };
  jest.spyOn(mockSource, 'createMockSimulator').mockImplementation((...args) => {
    captured.simulator = original(...args);
    return captured.simulator;
  });
  return captured;
}

/** Taps the discovery marker whose label matches, as a rider taps a pill on the map. */
export async function tapMarker(name: RegExp) {
  const marker = screen.getAllByLabelText(name).find((node) => node.props.testID === 'map-marker')!;
  await act(async () => {
    fireEvent.press(marker);
  });
}

/** From the draft's departure step: a named pickup, sign-in when asked, publish. */
export async function publishFromDraft(signIn: boolean) {
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

export async function signInWithDemoCode() {
  await press('Continue with demo identity');
  await wait(ANSWER_MS);
  await userEvent.type(screen.getByLabelText('Demo code'), '123456');
  await press('Verify demo code');
  await wait(ANSWER_MS);
}

/** Scenario A, with the rider's own active request to Asia Mall already published. */
export async function withActiveRequest() {
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
export async function confirmJoiningAida() {
  await tapMarker(/^Aida → Asia Mall, /);
  await wait(ANSWER_MS);
  await press('Plan to join this rider');
  await wait(ANSWER_MS);
}

/**
 * Another synthetic rider `n` (1–99) with an active request on the same source, ready to take a
 * seat. The seat is taken by a task due at once, which the source runs just before the next
 * operation's work (or at the next timer): so it can land while the rider's own join is on its
 * way, as scenario E describes. Phone numbers are from Ofcom's range for fiction.
 */
export async function anotherRider(simulator: Simulator<MockWorld>, n: number) {
  const session = { accessToken: null as string | null };
  const other = mockSource.createMockDataSource(simulator, { accessToken: () => session.accessToken });
  const settle = async <Value>(call: Promise<Value>) => {
    await wait(ANSWER_MS);
    return call;
  };
  const challenge = await settle(other.auth.requestOtp({ phoneNumber: `+4477009002${String(n).padStart(2, '0')}` }));
  const signedIn = await settle(other.auth.verifyOtp({ challengeId: challenge.id, code: DEMO_OTP_CODE }));
  session.accessToken = signedIn.accessToken;
  const ride = await settle(
    other.rides.create({
      operationId: `00000000-0000-4000-8000-${String(900 + n).padStart(12, '0')}`,
      origin: { source: 'manual', coordinates: { latitude: 42.8746, longitude: 74.6122 } },
      destinationPlaceId: 'place_tsum',
      departureOffsetMinutes: 5,
    }),
  );
  return {
    userId: signedIn.user.id,
    rideId: ride.id,
    takeSeatMeanwhile: (groupId: string) => takeSeat({ kind: 'group', id: groupId }),
    /** Joins `target` as a task due at once; refusals are ignored, as another rider's would be. */
    takeSeat,
  };
  function takeSeat(target: { kind: 'ride' | 'group'; id: string }) {
    return simulator.schedule(0, (context) => {
      try {
        joinGroup(context, signedIn.accessToken, {
          operationId: `00000000-0000-4000-8000-${String(800 + n).padStart(12, '0')}`,
          rideRequestId: ride.id,
          target,
        });
      } catch {
        // Another rider's refusal is theirs; the test checks the world instead.
      }
    });
  }
}
