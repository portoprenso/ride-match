import type { RideGroupDto } from '@ride-match/contracts';
import { Linking } from 'react-native';

import { isReviewCurrent, metersBetween, reviewTaxiTrip } from '../src/features/groups/taxiReview';
import { openTaxi, openTaxiWebsite, type TaxiLinking } from '../src/platform/taxi/openTaxi';
import { buildYandexGoLink, type TaxiTrip } from '../src/platform/taxi/yandexGo';

// Synthetic places in Almaty, about 3 km apart.
const MEETING = { latitude: 43.238949, longitude: 76.945465 };
const DESTINATION = { latitude: 43.218, longitude: 76.927 };
const TRIP: TaxiTrip = { pickup: MEETING, destination: DESTINATION };

const STORE_LINK =
  'https://3.redirect.appmetrica.yandex.com/route?start-lat=43.238949&start-lon=76.945465&end-lat=43.218&end-lon=76.927' +
  '&appmetrica_tracking_id=1178268795219780156&lang=en';

function readyGroup(overrides: Partial<RideGroupDto> = {}): RideGroupDto {
  return {
    id: 'group_1',
    status: 'ready',
    coordinatorId: 'user_1',
    members: [],
    capacity: 4,
    destination: { id: 'place_1', label: 'Demo destination', detail: null, coordinates: DESTINATION },
    departureAt: '2026-11-08T10:00:00.000Z',
    meetingPoint: { id: 'point_1', label: 'Demo meeting point', coordinates: MEETING, walkingMinutes: 4 },
    createdAt: '2026-11-08T09:00:00.000Z',
    expiresAt: '2026-11-08T12:00:00.000Z',
    closure: null,
    version: 3,
    ...overrides,
  } as RideGroupDto;
}

function linking(result: 'accept' | 'refuse'): TaxiLinking & { openURL: jest.Mock } {
  return {
    openURL: jest.fn(async (url: string) => {
      if (result === 'refuse') throw new Error(`Could not open URL '${url}': No Activity found to handle Intent`);
    }),
  };
}

describe('Yandex Go link', () => {
  it('carries the pickup and destination in the documented format', () => {
    expect(buildYandexGoLink(TRIP, 'store')).toBe(STORE_LINK);
    expect(buildYandexGoLink(TRIP, 'website')).toBe(STORE_LINK.replace('1178268795219780156', '25395763362139037'));
  });

  it('writes coordinates with at most 6 decimals and no exponent', () => {
    const link = buildYandexGoLink(
      { pickup: { latitude: 0.0000001, longitude: -0.123456789 }, destination: { latitude: -33.9, longitude: 151.2 } },
      'store',
    );
    expect(link).toContain('start-lat=0&start-lon=-0.123457&end-lat=-33.9&end-lon=151.2&');
  });

  it('refuses coordinates that are not real points, without echoing them', () => {
    const wrong = { pickup: { latitude: 91, longitude: 0 }, destination: DESTINATION };
    expect(() => buildYandexGoLink(wrong, 'store')).toThrow(RangeError);
    expect(() => buildYandexGoLink(wrong, 'store')).toThrow(/^[^0-9]*$/);
    expect(() => buildYandexGoLink({ pickup: MEETING, destination: { latitude: NaN, longitude: 1 } }, 'store')).toThrow(
      RangeError,
    );
  });
});

describe('openTaxi', () => {
  let log: jest.SpyInstance[];
  beforeEach(() => {
    log = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      jest.spyOn(console, level).mockImplementation(() => undefined),
    );
  });
  afterEach(() => {
    for (const spy of log) expect(spy).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('hands the store-fallback link to the OS once', async () => {
    const os = linking('accept');
    await expect(openTaxi(TRIP, os)).resolves.toEqual({ kind: 'handed-off' });
    expect(os.openURL).toHaveBeenCalledTimes(1);
    expect(os.openURL).toHaveBeenCalledWith(STORE_LINK);
  });

  it('reports a refused link without the link or its places', async () => {
    const os = linking('refuse');
    const outcome = await openTaxi(TRIP, os);
    expect(outcome).toEqual({ kind: 'failed' });
    expect(JSON.stringify(outcome)).not.toMatch(/43\.2|redirect/);
    expect(os.openURL).toHaveBeenCalledTimes(1);
  });

  it('falls back to the website link on request', async () => {
    const os = linking('accept');
    await expect(openTaxiWebsite(TRIP, os)).resolves.toEqual({ kind: 'handed-off' });
    expect(os.openURL).toHaveBeenCalledWith(expect.stringContaining('appmetrica_tracking_id=25395763362139037'));
  });

  it('opens nothing for an invalid trip', async () => {
    const os = linking('accept');
    await expect(openTaxi({ pickup: MEETING, destination: { latitude: 0, longitude: 181 } }, os)).resolves.toEqual({
      kind: 'invalid',
    });
    expect(os.openURL).not.toHaveBeenCalled();
  });

  it('uses React Native’s Linking by default', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await expect(openTaxi(TRIP)).resolves.toEqual({ kind: 'handed-off' });
    expect(open).toHaveBeenCalledWith(STORE_LINK);
  });
});

describe('taxi review', () => {
  it('reviews a ready group’s meeting point and destination', () => {
    const result = reviewTaxiTrip(readyGroup());
    expect(result).toEqual({
      ok: true,
      review: {
        groupId: 'group_1',
        meetingPointId: 'point_1',
        pickup: { label: 'Demo meeting point', coordinates: MEETING },
        destination: { label: 'Demo destination', coordinates: DESTINATION },
        trip: TRIP,
      },
    });
  });

  it('makes no review for a group that isn’t ready, has no point, or goes nowhere', () => {
    expect(reviewTaxiTrip(readyGroup({ status: 'forming' }))).toEqual({ ok: false, problem: 'not-ready' });
    expect(reviewTaxiTrip(readyGroup({ status: 'completed' }))).toEqual({ ok: false, problem: 'not-ready' });
    expect(reviewTaxiTrip(readyGroup({ meetingPoint: null }))).toEqual({ ok: false, problem: 'no-meeting-point' });
    const nearby = { latitude: MEETING.latitude + 0.0005, longitude: MEETING.longitude };
    expect(
      reviewTaxiTrip(
        readyGroup({ destination: { id: 'place_2', label: 'Next door', detail: null, coordinates: nearby } }),
      ),
    ).toEqual({ ok: false, problem: 'same-place' });
    const broken = {
      id: 'point_9',
      label: 'Broken',
      coordinates: { latitude: 200, longitude: 0 },
      walkingMinutes: null,
    };
    expect(reviewTaxiTrip(readyGroup({ meetingPoint: broken }))).toEqual({ ok: false, problem: 'invalid-places' });
  });

  it('is current only for the same ready group, point and places', () => {
    const result = reviewTaxiTrip(readyGroup());
    if (!result.ok) throw new Error('expected a review');
    const { review } = result;
    const point = readyGroup().meetingPoint!;

    expect(isReviewCurrent(review, readyGroup({ version: 7 }))).toBe(true);
    expect(isReviewCurrent(review, readyGroup({ id: 'group_2' }))).toBe(false);
    expect(isReviewCurrent(review, readyGroup({ status: 'forming' }))).toBe(false);
    expect(isReviewCurrent(review, readyGroup({ meetingPoint: null }))).toBe(false);
    expect(isReviewCurrent(review, readyGroup({ meetingPoint: { ...point, id: 'point_2' } }))).toBe(false);
    expect(
      isReviewCurrent(review, readyGroup({ meetingPoint: { ...point, coordinates: { ...MEETING, latitude: 43.24 } } })),
    ).toBe(false);
    expect(
      isReviewCurrent(
        review,
        readyGroup({ destination: { id: 'place_1', label: 'Demo destination', detail: null, coordinates: MEETING } }),
      ),
    ).toBe(false);
  });

  it('measures distance on the sphere', () => {
    expect(metersBetween(MEETING, MEETING)).toBe(0);
    // One degree of latitude is about 111 km.
    expect(metersBetween({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeCloseTo(111_195, -1);
  });
});
