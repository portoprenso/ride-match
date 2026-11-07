import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { NearbyItemDto } from '@ride-match/contracts';

import * as sinks from '../src/analytics/sinks';
import { createMemorySink } from '../src/analytics/sinks';
import { DiscoveryPanel } from '../src/features/discovery/DiscoveryPanel';
import {
  approximateDistance,
  clusterItems,
  clusterZoomRegion,
  departureText,
  describeItem,
} from '../src/features/discovery/nearbyItems';
import { NearbyListSheet } from '../src/features/discovery/NearbyListSheet';
import { DEMO_CITY_REGION, streetRegion } from '../src/features/map/mapCamera';
import { BLOCKED, device, openHome, press, pressLast, wait } from './helpers/locationDevice';
import { flushTimersAndRestore } from './helpers/renderApp';

/** The stand-in map's camera commands (`tests/setup/reactNativeMaps.ts`). */
const { animateToRegion } = jest.requireMock<{ animateToRegion: jest.Mock }>('react-native-maps');

// Longer than the mock source's largest simulated latency.
const ANSWER_MS = 1000;

/** Discovery markers: single items name a destination ("→"), clusters count ride plans. */
const itemMarkers = () => screen.queryAllByLabelText(/ → /).filter((node) => node.props.testID === 'map-marker');
const clusterMarkers = () => screen.queryAllByLabelText(/^\d+ ride plans here\./);
/** The nearby list's rows: buttons named after a ride or group ("Aida → Asia Mall, …"). */
const listRows = () => screen.getAllByRole('button', { name: / → / });
const clusterCount = (node: { props: Record<string, unknown> }) =>
  Number(String(node.props.accessibilityLabel).split(' ')[0]);

async function openScenario(scenario: string) {
  process.env.EXPO_PUBLIC_MOCK_SCENARIO = scenario;
  device({ permission: BLOCKED });
  await openHome();
  await wait(ANSWER_MS);
}

function recordAnalytics() {
  const sink = createMemorySink();
  jest.spyOn(sinks, 'selectAnalyticsSink').mockReturnValue(sink);
  return () => sink.events();
}

describe('nearby markers and list', () => {
  afterEach(async () => {
    await flushTimersAndRestore();
    jest.restoreAllMocks();
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'active-neighborhood';
  });

  it('draws the active neighbourhood, and the list shows the same items', async () => {
    await openScenario('active-neighborhood');

    const onMap = itemMarkers().length + clusterMarkers().reduce((sum, node) => sum + clusterCount(node), 0);
    // The map draws exactly what the sheet counts (Cholpon's ride in Vostok-5 is outside this view).
    expect(screen.getByText(`${onMap} ride plans in this view: 5 riders and 2 groups.`)).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Aida → Asia Mall, Leaving in \d+ min$/)).toBeOnTheScreen();

    await press('View nearby items');

    expect(screen.getByRole('header', { name: 'Nearby, at a glance.' })).toBeOnTheScreen();
    expect(screen.getByText('Demo · approximate distances')).toBeOnTheScreen();
    expect(listRows()).toHaveLength(onMap);
    expect(screen.getByRole('button', { name: /^Group → TSUM, 3\/4 people · / })).toBeOnTheScreen();
  });

  it('counts a hundred items once each, groups included, in clusters and in the list', async () => {
    await openScenario('map-density');

    const clusters = clusterMarkers();
    expect(clusters.length).toBeGreaterThan(0);
    const onMap = itemMarkers().length + clusters.reduce((sum, node) => sum + clusterCount(node), 0);
    expect(onMap).toBe(100);
    expect(screen.getByText('100 ride plans in this view: 75 riders and 25 groups.')).toBeOnTheScreen();

    await press('View nearby items');
    expect(listRows()).toHaveLength(100);
  });

  it('zooms into a cluster that can separate, and lists one that cannot', async () => {
    await openScenario('map-density');
    const before = animateToRegion.mock.calls.length;

    // At the city view a cluster spans several blocks, so zooming in can part it.
    await act(async () => {
      fireEvent.press(clusterMarkers().find((node) => clusterCount(node) > 4)!);
    });
    expect(animateToRegion.mock.calls.length).toBe(before + 1);

    // Close in, a block's three rides and its group share one public area, so the map cannot part them.
    const map = screen.getByTestId('home-map');
    await act(async () => {
      fireEvent(map, 'regionChangeComplete', streetRegion({ latitude: 42.846, longitude: 74.565 }));
    });
    await wait(ANSWER_MS);
    const block = clusterMarkers().find((node) => clusterCount(node) === 4)!;
    await act(async () => {
      fireEvent.press(block);
    });

    expect(animateToRegion.mock.calls.length).toBe(before + 1);
    expect(screen.getByRole('header', { name: '4 ride plans here' })).toBeOnTheScreen();
    expect(listRows()).toHaveLength(4);
  });

  it('opens an item from the list as a preview, shows it on the map, and goes back', async () => {
    await openScenario('active-neighborhood');

    await press('View nearby items');
    await press(/^Aida → Asia Mall, /);

    expect(screen.queryByRole('header', { name: 'Nearby, at a glance.' })).not.toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Heading to Asia Mall' })).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Aida → Asia Mall, .*, selected$/)).toBeOnTheScreen();
    expect(animateToRegion).toHaveBeenLastCalledWith(
      streetRegion({ latitude: 42.815, longitude: 74.626 }),
      expect.any(Number),
    );

    await pressLast('Back to map');
    expect(screen.queryByRole('header', { name: 'Heading to Asia Mall' })).not.toBeOnTheScreen();
    expect(screen.queryByLabelText(/, selected$/)).not.toBeOnTheScreen();
  });

  it('records a marker tap and a marker seen for a second, never a cluster', async () => {
    const events = recordAnalytics();
    await openScenario('active-neighborhood');
    await wait(1_100);

    await act(async () => {
      fireEvent.press(screen.getByLabelText(/^Aida → Asia Mall, /));
    });

    const names = events().map((event) => [event.name, event.properties]);
    expect(names).toContainEqual(['nearby_marker_tapped', { kind: 'ride' }]);
    const seen = events().filter((event) => event.name === 'nearby_marker_seen');
    expect(seen.length).toBe(itemMarkers().length);
    expect(screen.getByRole('header', { name: 'Heading to Asia Mall' })).toBeOnTheScreen();
  });
});

const METRICS = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

describe('nearby pieces', () => {
  const ride = (id: string, latitude: number, longitude: number): NearbyItemDto =>
    ({
      kind: 'ride',
      id,
      user: { id: `u-${id}`, displayName: 'Aida', avatarUrl: null },
      publicOrigin: { center: { latitude, longitude }, radiusMeters: 500, label: null },
      destination: {
        id: 'place_asia_mall',
        label: 'Asia Mall',
        detail: null,
        coordinates: { latitude: 42.85, longitude: 74.58 },
      },
      departureAt: '2026-11-07T10:05:00.000Z',
      expiresAt: '2026-11-07T10:15:00.000Z',
      version: 1,
    }) as NearbyItemDto;
  const group = {
    ...ride('g', 42.87, 74.6),
    kind: 'group',
    status: 'forming',
    memberCount: 3,
    capacity: 4,
  } as unknown as NearbyItemDto;
  const now = Date.parse('2026-11-07T10:00:00.000Z');

  it('words rides and groups from public fields only', () => {
    expect(describeItem(ride('a', 42.87, 74.6), null, now)).toEqual({
      title: 'Aida → Asia Mall',
      detail: 'Leaving in 5 min',
      markerLabel: 'Asia Mall',
    });
    expect(describeItem(group, { latitude: 42.873, longitude: 74.6 }, now)).toEqual({
      title: 'Group → Asia Mall',
      detail: '3/4 people · ~350 m · Leaving in 5 min',
      markerLabel: 'Asia Mall · 3/4',
    });
  });

  it('rounds distances so they never read as exact', () => {
    expect(approximateDistance({ latitude: 42.87, longitude: 74.6 }, { latitude: 42.87, longitude: 74.6 })).toBe(
      '~50 m',
    );
    expect(approximateDistance({ latitude: 42.87, longitude: 74.6 }, { latitude: 42.881, longitude: 74.6 })).toBe(
      '~1.2 km',
    );
    expect(departureText('2026-11-07T09:59:00.000Z', now)).toBe('Leaving now');
  });

  it('clusters overlapping items by zoom, and keeps distant ones apart', () => {
    const items = [ride('a', 42.87, 74.6), ride('b', 42.8701, 74.6001), ride('c', 42.95, 74.7)];
    const wide = clusterItems(items, DEMO_CITY_REGION);
    expect(wide.map((entry) => (entry.kind === 'cluster' ? entry.items.length : 1)).sort()).toEqual([1, 2]);
    const close = clusterItems(items, {
      latitude: 42.87,
      longitude: 74.6,
      latitudeDelta: 0.0002,
      longitudeDelta: 0.0002,
    });
    expect(close.every((entry) => entry.kind === 'item')).toBe(true);
  });

  it('zooms only when it can separate a cluster', () => {
    const apart = [ride('a', 42.87, 74.6), ride('b', 42.88, 74.61)];
    const zoom = clusterZoomRegion(apart, DEMO_CITY_REGION)!;
    expect(zoom.latitude).toBeCloseTo(42.875);
    expect(zoom.longitude).toBeCloseTo(74.605);
    expect(zoom.latitudeDelta).toBeLessThan(DEMO_CITY_REGION.latitudeDelta);
    const together = [ride('a', 42.87, 74.6), ride('b', 42.87, 74.6)];
    expect(clusterZoomRegion(together, DEMO_CITY_REGION)).toBeNull();
  });

  it('says when the list was cut short or is the last view', async () => {
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <NearbyListSheet
          content={{ items: [ride('a', 42.87, 74.6)], truncated: true, stale: true, fromCluster: false }}
          onClose={jest.fn()}
          onSelect={jest.fn()}
          fix={null}
          now={now}
          demo={false}
        />
      </SafeAreaProvider>,
    );
    expect(
      screen.getByText('Showing the nearest 1. More ride plans are in this view; zoom in to see a smaller area.'),
    ).toBeOnTheScreen();
    expect(screen.getByText('This is the last view. These ride plans may have changed.')).toBeOnTheScreen();
  });

  it('points to the list when the map cannot load (screen 26)', async () => {
    await render(
      <DiscoveryPanel state={{ kind: 'loading' }} onRetry={jest.fn()} onOpenList={jest.fn()} tileStatus="slow" />,
    );
    expect(
      screen.getByText('The map can’t load right now. Nearby ride data may still be available in the list.'),
    ).toBeOnTheScreen();
  });
});
