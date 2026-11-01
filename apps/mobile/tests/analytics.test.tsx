import { act, cleanup, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { AnalyticsProvider, useAnalytics } from '../src/analytics/AnalyticsProvider';
import {
  createAnalytics,
  isRealUserEvent,
  MARKER_DWELL_MS,
  SESSION_TIMEOUT_MS,
  type Analytics,
  type AnalyticsOptions,
} from '../src/analytics/createAnalytics';
import { ANALYTICS_EVENTS, AnalyticsEventError, countBucket, INTENT_SUCCESS_PAIRS } from '../src/analytics/events';
import { createMemorySink, noopSink, selectAnalyticsSink, type MemorySink } from '../src/analytics/sinks';

const START = Date.parse('2026-11-01T09:00:00.000Z');

function fakeAppState(currentState = 'active') {
  const listeners = new Set<(state: string) => void>();
  return {
    currentState,
    addEventListener: (_type: 'change', listener: (state: string) => void) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
    change(next: string) {
      this.currentState = next;
      for (const listener of [...listeners]) listener(next);
    },
    listenerCount: () => listeners.size,
  };
}

let clients: Analytics[] = [];
function setup(overrides: Partial<AnalyticsOptions> & { appStateNow?: string } = {}) {
  const sink = createMemorySink();
  const appState = fakeAppState(overrides.appStateNow);
  let session = 0;
  const analytics = createAnalytics({
    sink,
    environment: 'development',
    appVersion: '0.0.0',
    dataSource: { kind: 'mock', scenario: 'active-neighborhood' },
    appState,
    createSessionId: () => `ses_${(session += 1)}`,
    ...overrides,
  });
  clients.push(analytics);
  const names = () => sink.events().map((event) => event.name);
  return { sink, appState, analytics, names };
}

const lastEvent = (sink: MemorySink) => sink.events().at(-1);

beforeEach(() => {
  jest.useFakeTimers({ now: START });
});

afterEach(() => {
  for (const analytics of clients) analytics.dispose();
  clients = [];
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});

describe('catalog', () => {
  it('defines exactly the events in docs/DEVELOPMENT.md', () => {
    expect(Object.keys(ANALYTICS_EVENTS).sort()).toEqual(
      [
        'app_opened',
        'map_opened',
        'nearby_activity_exposed',
        'nearby_marker_seen',
        'nearby_marker_tapped',
        'destination_selected',
        'ride_request_create_clicked',
        'ride_request_created',
        'ride_request_expired',
        'match_found',
        'group_join_clicked',
        'group_joined',
        'group_leave_clicked',
        'group_left',
        'message_send_clicked',
        'message_sent',
        'meeting_point_viewed',
        'taxi_open_clicked',
        'taxi_opened',
        'ride_completed',
        'user_reported',
        'user_blocked',
      ].sort(),
    );
  });

  it('keeps each intent apart from the success that only the source may confirm', () => {
    for (const [intent, success] of INTENT_SUCCESS_PAIRS) {
      expect(intent).not.toBe(success);
      expect(ANALYTICS_EVENTS[intent].stage).toBe('intent');
      expect(ANALYTICS_EVENTS[success].stage).toBe('success');
    }
  });

  it('buckets visible activity counts instead of recording them exactly', () => {
    expect([0, 1, 2, 5, 6, 20, 21, 100].map(countBucket)).toEqual(['0', '1', '2-5', '2-5', '6-20', '6-20', '21+', '21+']);
  });
});

describe('tracking', () => {
  it('records a valid event with its stage, session, order, time and context', () => {
    const { sink, analytics } = setup();
    analytics.start();
    jest.advanceTimersByTime(5_000);

    analytics.track('group_joined', { kind: 'ride', memberCount: 2 });
    expect(lastEvent(sink)).toEqual({
      name: 'group_joined',
      stage: 'success',
      properties: { kind: 'ride', memberCount: 2 },
      sessionId: 'ses_1',
      sequence: 2,
      occurredAt: '2026-11-01T09:00:05.000Z',
      context: {
        environment: 'development',
        appVersion: '0.0.0',
        mockScenario: 'active-neighborhood',
        synthetic: true,
        installationId: null,
        userId: null,
      },
    });
  });

  it.each([
    ['a coordinate', 'ride_request_created', { departureOffsetMinutes: 5, pickup: 'device', latitude: 42.874_321 }, '"latitude"'],
    ['a phone number', 'app_opened', { phoneNumber: '+996555000111' }, '"phoneNumber"'],
    ['search text', 'destination_selected', { query: 'asia mall' }, '"query"'],
    ['message text', 'message_sent', { text: 'see you at the gate' }, '"text"'],
    ['report details', 'user_reported', { reason: 'other', details: 'synthetic details' }, '"details"'],
    ['a value outside its range', 'group_joined', { kind: 'ride', memberCount: 5 }, '"memberCount" as a whole number from 2 to 4'],
    ['an unknown level', 'match_found', { level: 'perfect', kind: 'ride' }, '"level" as one of possible, good, excellent'],
    ['a missing property', 'nearby_marker_tapped', {}, '"kind" as one of ride, group'],
    ['an unknown event', 'button_pressed', {}, 'Unknown analytics event "button_pressed"'],
  ])('rejects %s without recording it or repeating the value', (_case, name, properties, expected) => {
    const { sink, analytics } = setup();
    analytics.start();
    sink.clear();

    let error: unknown;
    try {
      (analytics.track as (name: string, properties: object) => void)(name, properties);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(AnalyticsEventError);
    expect((error as Error).message).toContain(expected);
    for (const value of Object.values(properties)) expect((error as Error).message).not.toContain(String(value));
    expect(sink.events()).toEqual([]);
  });

  it('rejects sensitive properties at compile time too', () => {
    const { analytics } = setup();
    analytics.start();

    // @ts-expect-error A coordinate is not a property of any event.
    expect(() => analytics.track('map_opened', { latitude: 42.87 })).toThrow(AnalyticsEventError);
    // @ts-expect-error Free text is not a property of any event.
    expect(() => analytics.track('message_sent', { text: 'synthetic' })).toThrow(AnalyticsEventError);
  });

  it('refuses events before it starts, and ignores them after disposal', () => {
    const { sink, analytics } = setup();

    expect(() => analytics.track('map_opened')).toThrow('Event "map_opened" was tracked before analytics started.');
    analytics.start();
    analytics.dispose();
    analytics.track('map_opened');
    expect(sink.events().map((event) => event.name)).toEqual(['app_opened']);
  });

  it('records once per session or once per key when asked', () => {
    const { names, appState, analytics } = setup();
    analytics.start();

    analytics.trackOncePerSession('map_opened');
    analytics.trackOncePerSession('map_opened');
    analytics.trackOnce('ride:ride_1', 'ride_request_expired');
    analytics.trackOnce('ride:ride_1', 'ride_request_expired');
    analytics.trackOnce('ride:ride_2', 'ride_request_expired');
    appState.change('background');
    jest.advanceTimersByTime(SESSION_TIMEOUT_MS);
    appState.change('active');
    analytics.trackOncePerSession('map_opened');
    analytics.trackOnce('ride:ride_1', 'ride_request_expired');

    expect(names()).toEqual([
      'app_opened',
      'map_opened',
      'ride_request_expired',
      'ride_request_expired',
      'app_opened',
      'map_opened',
    ]);
  });

  it('adds the signed-in user to later events only', () => {
    const { sink, analytics } = setup();
    analytics.start();

    analytics.setUser('user_1');
    analytics.track('map_opened');
    analytics.setUser(null);
    analytics.track('destination_selected');
    expect(sink.events().map((event) => event.context.userId)).toEqual([null, 'user_1', null]);
  });
});

describe('sessions', () => {
  it('continues a session after a short absence and starts a new one after 30 minutes away', () => {
    const { sink, appState, analytics } = setup();
    analytics.start();

    appState.change('inactive');
    appState.change('active');
    appState.change('background');
    jest.advanceTimersByTime(SESSION_TIMEOUT_MS - 1);
    appState.change('active');
    expect(sink.events().map((event) => event.sessionId)).toEqual(['ses_1']);

    appState.change('background');
    jest.advanceTimersByTime(SESSION_TIMEOUT_MS);
    appState.change('active');
    expect(sink.events().map((event) => [event.name, event.sessionId])).toEqual([
      ['app_opened', 'ses_1'],
      ['app_opened', 'ses_2'],
    ]);
  });

  it('begins the first session on the first foreground when started in the background', () => {
    const { names, appState, analytics } = setup({ appStateNow: 'background' });
    analytics.start();
    expect(names()).toEqual([]);

    appState.change('active');
    expect(names()).toEqual(['app_opened']);
  });
});

describe('marker dwell', () => {
  const ride = { kind: 'ride', id: 'ride_1' } as const;

  it('records a marker seen after one second of visibility, once per session, without its ID', () => {
    const { sink, names, analytics } = setup();
    analytics.start();

    analytics.markerVisible(ride);
    jest.advanceTimersByTime(MARKER_DWELL_MS - 1);
    expect(names()).toEqual(['app_opened']);
    jest.advanceTimersByTime(1);
    expect(lastEvent(sink)).toMatchObject({ name: 'nearby_marker_seen', properties: { kind: 'ride' } });
    expect(JSON.stringify(sink.events())).not.toContain('ride_1');

    analytics.markerHidden(ride);
    analytics.markerVisible(ride);
    jest.advanceTimersByTime(MARKER_DWELL_MS);
    expect(names()).toEqual(['app_opened', 'nearby_marker_seen']);
  });

  it('does not count a marker hidden before the dwell ends', () => {
    const { names, analytics } = setup();
    analytics.start();

    analytics.markerVisible(ride);
    jest.advanceTimersByTime(MARKER_DWELL_MS / 2);
    analytics.markerHidden(ride);
    jest.advanceTimersByTime(MARKER_DWELL_MS);
    expect(names()).toEqual(['app_opened']);
  });

  it('counts only foreground time, and counts the marker again in a new session', () => {
    const { names, appState, analytics } = setup();
    analytics.start();

    analytics.markerVisible(ride);
    jest.advanceTimersByTime(MARKER_DWELL_MS / 2);
    appState.change('background');
    jest.advanceTimersByTime(SESSION_TIMEOUT_MS);
    expect(names()).toEqual(['app_opened']);

    appState.change('active');
    jest.advanceTimersByTime(MARKER_DWELL_MS - 1);
    expect(names()).toEqual(['app_opened', 'app_opened']);
    jest.advanceTimersByTime(1);
    expect(names()).toEqual(['app_opened', 'app_opened', 'nearby_marker_seen']);
  });

  it('cancels dwell timers and stops following the app state on disposal', () => {
    const { appState, analytics } = setup();
    analytics.start();
    analytics.markerVisible(ride);

    analytics.dispose();
    expect(jest.getTimerCount()).toBe(0);
    expect(appState.listenerCount()).toBe(0);
  });
});

describe('synthetic traffic and sinks', () => {
  it('marks mock-source events synthetic, so real-user metrics exclude them', () => {
    const mock = setup({ environment: 'production' });
    const real = setup({ environment: 'production', dataSource: { kind: 'api' } });
    const preview = setup({ environment: 'preview', dataSource: { kind: 'api' } });
    for (const { analytics } of [mock, real, preview]) analytics.start();

    expect(mock.sink.events()[0]?.context).toMatchObject({ synthetic: true, mockScenario: 'active-neighborhood' });
    expect(real.sink.events()[0]?.context).toMatchObject({ synthetic: false, mockScenario: null });
    expect([mock, real, preview].map(({ sink }) => sink.events().filter(isRealUserEvent).length)).toEqual([0, 1, 0]);
  });

  it('keeps recent events in memory up to its limit', () => {
    const sink = createMemorySink(2);
    const { analytics } = setup({ sink });
    analytics.start();

    analytics.track('map_opened');
    analytics.track('destination_selected');
    expect(sink.events().map((event) => event.name)).toEqual(['map_opened', 'destination_selected']);
    sink.clear();
    expect(sink.events()).toEqual([]);
  });

  it('keeps events in memory in development and preview, and discards them in production', () => {
    expect(selectAnalyticsSink('production')).toBe(noopSink);
    expect(selectAnalyticsSink('development')).not.toBe(noopSink);
    expect(selectAnalyticsSink('preview')).toHaveProperty('events');
  });
});

describe('useAnalytics', () => {
  // Unmount first, then run the timers React's scheduler left, as the route tests do.
  afterEach(async () => {
    await cleanup();
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.runAllTicks();
  });

  it('returns the provided client', async () => {
    const { analytics } = setup();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AnalyticsProvider analytics={analytics}>{children}</AnalyticsProvider>
    );

    const { result } = await renderHook(() => useAnalytics(), { wrapper });
    expect(result.current).toBe(analytics);
  });
});
