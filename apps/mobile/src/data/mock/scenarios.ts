import {
  GROUP_POLICY,
  RIDE_POLICY,
  type CoordinatesDto,
  type DepartureOffsetMinutes,
  type MatchLevel,
  type PublicLocationDto,
} from '@ride-match/contracts';

import type { IdGenerator } from './ids';
import { admitRide, scheduleDeadlines, type Schedule } from './lifecycle';
import type { SeedContext, Simulator, SimulatorOptions } from './simulator';
import { createEmptyWorld, type GroupMemberRecord, type MockWorld, type RideRecord } from './world';

/*
 * Scenario seeds (docs/MOCK_SCENARIOS.md). Every person is invented: first names only, no
 * avatars, no phone numbers. Areas and points are approximate demo coordinates in Bishkek.
 * Times count back from activation, so a seed looks the same whenever it starts.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** Public pickup areas, district-sized, that riders' public origins show instead of their exact points. */
const AREAS = {
  center: { center: { latitude: 42.874, longitude: 74.596 }, radiusMeters: 600, label: 'City centre' },
  oshBazaar: { center: { latitude: 42.876, longitude: 74.566 }, radiusMeters: 600, label: 'Near Osh Bazaar' },
  dzhal: { center: { latitude: 42.838, longitude: 74.565 }, radiusMeters: 800, label: 'Dzhal' },
  asanbay: { center: { latitude: 42.815, longitude: 74.626 }, radiusMeters: 700, label: 'Asanbay' },
  kokZhar: { center: { latitude: 42.822, longitude: 74.603 }, radiusMeters: 700, label: 'Kok-Zhar' },
  vostok5: { center: { latitude: 42.836, longitude: 74.672 }, radiusMeters: 700, label: 'Vostok-5' },
  tunguch: { center: { latitude: 42.851, longitude: 74.658 }, radiusMeters: 700, label: 'Tunguch' },
  alamedin1: { center: { latitude: 42.889, longitude: 74.637 }, radiusMeters: 700, label: 'Alamedin-1' },
} satisfies Record<string, PublicLocationDto>;

/**
 * A match a scenario supplies for one destination choice (DESTINATION-001-A): fixture data,
 * written by hand, never computed. `departures` limits it to those departure choices.
 */
type MatchSeed = {
  destination: string;
  level: MatchLevel;
  additionalMinutes: number | null;
  departures?: readonly DepartureOffsetMinutes[];
};

type RideSeed = {
  rider: string;
  /** A named area above, or one built for a scenario (`map-density`). */
  area: keyof typeof AREAS | PublicLocationDto;
  /** The exact origin's offset from the area's center in degrees (latitude, longitude), well inside the area. */
  offset: readonly [number, number];
  destination: string;
  createdSecondsAgo: number;
  departureOffsetMinutes: DepartureOffsetMinutes;
  /** Supplied matches for a solo ride, shown while it is discoverable. */
  matches?: readonly MatchSeed[];
};

type GroupSeed = {
  status: 'forming' | 'ready';
  /** The agreed destination, which every member's request shares. */
  destination: string;
  createdSecondsAgo: number;
  /** Whose ride the founder joined; their area is the group's public origin and their departure the group's. */
  coordinator: Omit<RideSeed, 'destination'>;
  /** Joined the coordinator's ride, which created the group. */
  founder: Omit<RideSeed, 'destination'>;
  laterMembers: readonly (Omit<RideSeed, 'destination'> & { joinedSecondsAgo: number })[];
  meetingPoint: { label: string; coordinates: CoordinatesDto } | null;
  /** One change per join, meeting point and status change since creation. */
  version: number;
  /** Supplied matches for the group, shown while it is live. */
  matches?: readonly MatchSeed[];
};

/** Records a seed's supplied matches for `target` in the world. */
function supplyMatches(world: MockWorld, target: { kind: 'ride' | 'group'; id: string }, seeds: readonly MatchSeed[] = []) {
  for (const seed of seeds) {
    world.suppliedMatches.push({
      destinationPlaceId: seed.destination,
      target,
      level: seed.level,
      additionalMinutes: seed.additionalMinutes,
      departures: seed.departures ?? null,
    });
  }
}

const ACTIVE_SOLO_RIDES: readonly RideSeed[] = [
  { rider: 'Aida', area: 'asanbay', offset: [0.0021, -0.0018], destination: 'place_asia_mall', createdSecondsAgo: 120, departureOffsetMinutes: 5, matches: [{ destination: 'place_asia_mall', level: 'excellent', additionalMinutes: 0 }, { destination: 'place_vefa_center', level: 'good', additionalMinutes: 4, departures: [5, 10] }] },
  // Reaches its 15-minute deadline 20 seconds after activation.
  { rider: 'Bakyt', area: 'dzhal', offset: [-0.0016, 0.0024], destination: 'place_ala_too', createdSecondsAgo: 880, departureOffsetMinutes: 0, matches: [{ destination: 'place_ala_too', level: 'excellent', additionalMinutes: 0, departures: [0] }, { destination: 'place_tsum', level: 'possible', additionalMinutes: 7 }] },
  { rider: 'Cholpon', area: 'vostok5', offset: [0.0012, 0.0019], destination: 'place_manas_airport', createdSecondsAgo: 300, departureOffsetMinutes: 10, matches: [{ destination: 'place_manas_airport', level: 'excellent', additionalMinutes: 0 }] },
  { rider: 'Daniyar', area: 'alamedin1', offset: [-0.0022, -0.0011], destination: 'place_bishkek_park', createdSecondsAgo: 45, departureOffsetMinutes: 0, matches: [{ destination: 'place_bishkek_park', level: 'excellent', additionalMinutes: 0 }, { destination: 'place_philharmonic', level: 'good', additionalMinutes: 3 }] },
  { rider: 'Elnura', area: 'kokZhar', offset: [0.0015, 0.0023], destination: 'place_vefa_center', createdSecondsAgo: 540, departureOffsetMinutes: 5, matches: [{ destination: 'place_vefa_center', level: 'excellent', additionalMinutes: 0 }, { destination: 'place_asia_mall', level: 'good', additionalMinutes: 5 }] },
  { rider: 'Farkhat', area: 'oshBazaar', offset: [-0.0019, 0.0014], destination: 'place_dordoi_plaza', createdSecondsAgo: 200, departureOffsetMinutes: 10, matches: [{ destination: 'place_dordoi_plaza', level: 'excellent', additionalMinutes: 0 }, { destination: 'place_tsum', level: 'good', additionalMinutes: 2 }] },
];

const ACTIVE_GROUPS: readonly GroupSeed[] = [
  {
    status: 'forming',
    destination: 'place_tsum',
    createdSecondsAgo: 360,
    coordinator: { rider: 'Gulnara', area: 'center', offset: [0.0011, -0.0017], createdSecondsAgo: 420, departureOffsetMinutes: 10 },
    founder: { rider: 'Ilyas', area: 'center', offset: [-0.0014, 0.0009], createdSecondsAgo: 380, departureOffsetMinutes: 10 },
    laterMembers: [
      { rider: 'Jyldyz', area: 'kokZhar', offset: [-0.0012, -0.0021], createdSecondsAgo: 200, departureOffsetMinutes: 5, joinedSecondsAgo: 150 },
    ],
    meetingPoint: null,
    version: 2,
    // A ready group takes no riders, so the airport group below has no matches.
    matches: [
      { destination: 'place_tsum', level: 'excellent', additionalMinutes: 0 },
      { destination: 'place_ala_too', level: 'good', additionalMinutes: 3 },
      { destination: 'place_dordoi_plaza', level: 'possible', additionalMinutes: 6 },
    ],
  },
  {
    status: 'ready',
    destination: 'place_manas_airport',
    createdSecondsAgo: 240,
    coordinator: { rider: 'Kanat', area: 'tunguch', offset: [0.0018, 0.0013], createdSecondsAgo: 300, departureOffsetMinutes: 10 },
    founder: { rider: 'Meerim', area: 'tunguch', offset: [-0.0013, -0.0019], createdSecondsAgo: 270, departureOffsetMinutes: 5 },
    laterMembers: [],
    meetingPoint: { label: 'Tunguch, main bus stop', coordinates: { latitude: 42.8522, longitude: 74.6571 } },
    version: 3,
  },
];

/** A rider whose request appears 8 seconds after activation. */
const APPEARING_RIDE = {
  rider: 'Nurlan',
  area: 'center',
  offset: [-0.0008, 0.0021],
  destination: 'place_osh_bazaar',
  departureOffsetMinutes: 5,
  matches: [{ destination: 'place_osh_bazaar', level: 'excellent', additionalMinutes: 0 }],
} as const satisfies Omit<RideSeed, 'createdSecondsAgo'>;
const APPEARS_AFTER_MS = 8 * SECOND;

/** Six decimal places (about 0.1 m), so seeded points carry no floating-point noise. */
const round = (degrees: number) => Math.round(degrees * 1e6) / 1e6;

function addRider(world: MockWorld, ids: IdGenerator, displayName: string): string {
  const id = ids.next('user');
  world.users.set(id, { id, displayName, avatarUrl: null });
  return id;
}

/** A new rider and their request created at `createdAt`; the caller stores the request. */
function buildRide(
  world: MockWorld,
  ids: IdGenerator,
  seed: Omit<RideSeed, 'createdSecondsAgo'>,
  createdAt: number,
  link: { status: 'active'; groupId: null } | { status: 'grouped'; groupId: string },
): RideRecord {
  const userId = addRider(world, ids, seed.rider);
  const area = typeof seed.area === 'string' ? AREAS[seed.area] : seed.area;
  return {
    id: ids.next('ride'),
    userId,
    origin: {
      coordinates: { latitude: round(area.center.latitude + seed.offset[0]), longitude: round(area.center.longitude + seed.offset[1]) },
      source: 'device',
    },
    publicOrigin: { center: { ...area.center }, radiusMeters: area.radiusMeters, label: area.label },
    destinationPlaceId: seed.destination,
    createdAt,
    departureAt: createdAt + seed.departureOffsetMinutes * MINUTE,
    expiresAt: createdAt + RIDE_POLICY.activeLifetimeSeconds * SECOND,
    status: link.status,
    groupId: link.groupId,
    // A grouped request changed once, when it joined.
    version: link.status === 'grouped' ? 2 : 1,
  };
}

function addGroup(world: MockWorld, ids: IdGenerator, seed: GroupSeed, now: number): void {
  const groupId = ids.next('group');
  const createdAt = now - seed.createdSecondsAgo * SECOND;
  const link = { status: 'grouped', groupId } as const;
  const join = (member: Omit<RideSeed, 'destination'>, joinedAt: number) => {
    const ride = buildRide(world, ids, { ...member, destination: seed.destination }, now - member.createdSecondsAgo * SECOND, link);
    world.rides.set(ride.id, ride);
    return { ride, member: { userId: ride.userId, rideRequestId: ride.id, joinedAt } satisfies GroupMemberRecord };
  };

  const coordinator = join(seed.coordinator, createdAt);
  const coordinatorRide = coordinator.ride;
  const members = [
    coordinator.member,
    join(seed.founder, createdAt).member,
    ...seed.laterMembers.map((member) => join(member, now - member.joinedSecondsAgo * SECOND).member),
  ];
  world.groups.set(groupId, {
    id: groupId,
    status: seed.status,
    coordinatorId: coordinatorRide.userId,
    members,
    destinationPlaceId: seed.destination,
    departureAt: coordinatorRide.departureAt,
    publicOrigin: { ...coordinatorRide.publicOrigin, center: { ...coordinatorRide.publicOrigin.center } },
    meetingPoint:
      seed.meetingPoint === null
        ? null
        : { id: ids.next('meeting'), label: seed.meetingPoint.label, coordinates: { ...seed.meetingPoint.coordinates } },
    createdAt,
    expiresAt: createdAt + GROUP_POLICY.lifetimeSeconds * SECOND,
    closure: null,
    version: seed.version,
  });
  supplyMatches(world, { kind: 'group', id: groupId }, seed.matches);
}

/** Scenario A: six solo rides and two groups (one forming with three members, one ready with two). */
function createActiveNeighborhood({ now, ids }: SeedContext): MockWorld {
  const world = createEmptyWorld(now);
  for (const seed of ACTIVE_SOLO_RIDES) {
    const ride = buildRide(world, ids, seed, now - seed.createdSecondsAgo * SECOND, { status: 'active', groupId: null });
    world.rides.set(ride.id, ride);
    supplyMatches(world, { kind: 'ride', id: ride.id }, seed.matches);
  }
  for (const seed of ACTIVE_GROUPS) addGroup(world, ids, seed, now);
  return world;
}

/**
 * Scenario C's riders: one heading to Asia Mall, whom the source matches with a new own request,
 * and two unrelated plans. No destination previews are supplied, so nothing is emphasized until
 * the rider has a request of their own.
 */
const MATCH_SCENARIO_RIDES: readonly RideSeed[] = [
  { rider: 'Aida', area: 'asanbay', offset: [0.0021, -0.0018], destination: 'place_asia_mall', createdSecondsAgo: 60, departureOffsetMinutes: 5 },
  { rider: 'Bakyt', area: 'dzhal', offset: [-0.0016, 0.0024], destination: 'place_osh_bazaar', createdSecondsAgo: 30, departureOffsetMinutes: 10 },
  { rider: 'Cholpon', area: 'vostok5', offset: [0.0012, 0.0019], destination: 'place_manas_airport', createdSecondsAgo: 120, departureOffsetMinutes: 10 },
];

/** How long after the rider's own request the match arrives, and how long it holds. */
const MATCH_ARRIVES_AFTER_MS = 5 * SECOND;
const MATCH_LIFETIME_MS = 3 * MINUTE;

/**
 * Scenario C: unrelated nearby activity, then five seconds after the rider creates a request the
 * source supplies one excellent match with Aida's ride, holding for three minutes (or until
 * either request ends).
 */
function createMatchAppears({ now, ids }: SeedContext): MockWorld {
  const world = createEmptyWorld(now);
  const created = MATCH_SCENARIO_RIDES.map((seed) => {
    const ride = buildRide(world, ids, seed, now - seed.createdSecondsAgo * SECOND, { status: 'active', groupId: null });
    world.rides.set(ride.id, ride);
    return ride;
  });
  world.matchArrivals.push({
    delayMs: MATCH_ARRIVES_AFTER_MS,
    targetRideId: created[0]!.id,
    level: 'excellent',
    additionalMinutes: 2,
    lifetimeMs: MATCH_LIFETIME_MS,
  });
  return world;
}

/** Invented first names for the busy map; they repeat, as names do. */
const DENSITY_NAMES = ['Aidai', 'Bolot', 'Chinara', 'Dastan', 'Eldiyar', 'Gulzat', 'Kairat', 'Medina', 'Nurbek', 'Saltanat'];
const DENSITY_DESTINATIONS = [
  'place_asia_mall',
  'place_ala_too',
  'place_tsum',
  'place_dordoi_plaza',
  'place_vefa_center',
  'place_osh_bazaar',
  'place_bishkek_park',
  'place_philharmonic',
];
const DEPARTURES: readonly DepartureOffsetMinutes[] = [0, 5, 10];
/** Rows and columns of the busy map's blocks; each block holds three rides and one group. */
const DENSITY_GRID = 5;

/** A synthetic public block of the busy map's grid, about 1.3 km apart, labelled as demo data. */
function densityArea(row: number, column: number): PublicLocationDto {
  return {
    center: { latitude: round(42.846 + row * 0.012), longitude: round(74.565 + column * 0.016) },
    radiusMeters: 500,
    label: `Demo block ${row * DENSITY_GRID + column + 1}`,
  };
}

/**
 * Scenario M: a hundred discovery items in the demo city's view, 75 solo rides and 25 forming
 * groups of two, spread over a 5 × 5 grid of blocks, so clusters, the list and the full snapshot
 * limit can be tried. Every value is derived from its position, so the seed repeats exactly.
 */
function createMapDensity({ now, ids }: SeedContext): MockWorld {
  const world = createEmptyWorld(now);
  let index = 0;
  const next = () => index++;
  for (let row = 0; row < DENSITY_GRID; row += 1) {
    for (let column = 0; column < DENSITY_GRID; column += 1) {
      const area = densityArea(row, column);
      for (let rider = 0; rider < 3; rider += 1) {
        const i = next();
        const seed: RideSeed = {
          rider: DENSITY_NAMES[i % DENSITY_NAMES.length]!,
          area,
          offset: [((i % 5) - 2) * 0.0006, ((i % 3) - 1) * 0.0008],
          destination: DENSITY_DESTINATIONS[i % DENSITY_DESTINATIONS.length]!,
          createdSecondsAgo: 30 + ((i * 37) % 800),
          departureOffsetMinutes: DEPARTURES[i % DEPARTURES.length]!,
        };
        const ride = buildRide(world, ids, seed, now - seed.createdSecondsAgo * SECOND, { status: 'active', groupId: null });
        world.rides.set(ride.id, ride);
        // The first ride of each block fits its own destination well: plenty of matches, not all.
        if (rider === 0) supplyMatches(world, { kind: 'ride', id: ride.id }, [{ destination: seed.destination, level: 'excellent', additionalMinutes: 0 }]);
      }
      const g = next();
      const groupCreated = 60 + ((g * 53) % 540);
      addGroup(
        world,
        ids,
        {
          status: 'forming',
          destination: DENSITY_DESTINATIONS[(g + 3) % DENSITY_DESTINATIONS.length]!,
          createdSecondsAgo: groupCreated,
          coordinator: {
            rider: DENSITY_NAMES[g % DENSITY_NAMES.length]!,
            area,
            offset: [0.0005, -0.0005],
            createdSecondsAgo: groupCreated + 60,
            departureOffsetMinutes: DEPARTURES[g % DEPARTURES.length]!,
          },
          founder: {
            rider: DENSITY_NAMES[(g + 1) % DENSITY_NAMES.length]!,
            area,
            offset: [-0.0005, 0.0005],
            createdSecondsAgo: groupCreated + 30,
            departureOffsetMinutes: DEPARTURES[g % DEPARTURES.length]!,
          },
          laterMembers: [],
          meetingPoint: null,
          version: 1,
          matches: [
            { destination: DENSITY_DESTINATIONS[(g + 3) % DENSITY_DESTINATIONS.length]!, level: 'good', additionalMinutes: 2 },
          ],
        },
        now,
      );
    }
  }
  return world;
}

/** Scenario A's timed event: a new ride appears after 8 seconds (the expiry at 20 seconds is a seeded deadline). */
function scheduleActiveNeighborhood(world: MockWorld, schedule: Schedule): void {
  const appearsAt = world.activatedAt + APPEARS_AFTER_MS;
  schedule(appearsAt, (context) => {
    const ride = buildRide(context.state, context.ids, APPEARING_RIDE, appearsAt, { status: 'active', groupId: null });
    admitRide(context, ride);
    supplyMatches(context.state, { kind: 'ride', id: ride.id }, APPEARING_RIDE.matches);
  });
}

type ScenarioDefinition = {
  createWorld(context: SeedContext): MockWorld;
  /** Schedules the scenario's own timed events, counted from `world.activatedAt`. */
  scheduleEvents?(world: MockWorld, schedule: Schedule): void;
};

const SCENARIOS = {
  'active-neighborhood': { createWorld: createActiveNeighborhood, scheduleEvents: scheduleActiveNeighborhood },
  // Scenario B: no activity at all, and nothing appears; the curated places still exist.
  'empty-neighborhood': { createWorld: ({ now }) => createEmptyWorld(now) },
  // Scenario M: a hundred items for clusters, the list and the snapshot limit.
  // Scenario C: unrelated activity, then a supplied match five seconds after the rider's request.
  'match-appears': { createWorld: createMatchAppears },
  'map-density': { createWorld: createMapDensity },
} satisfies Record<string, ScenarioDefinition>;

/** Key of an implemented scenario, as `EXPO_PUBLIC_MOCK_SCENARIO` names it. */
export type MockScenarioKey = keyof typeof SCENARIOS;

/** The implemented scenarios. Later cards add the other keys in docs/MOCK_SCENARIOS.md with their operations. */
export const MOCK_SCENARIO_KEYS = Object.keys(SCENARIOS) as MockScenarioKey[];

export function isMockScenarioKey(key: string): key is MockScenarioKey {
  return (MOCK_SCENARIO_KEYS as string[]).includes(key);
}

/**
 * The simulator options that run a scenario: its world, and on every activation (creation and
 * reset) the deadlines of its live rides and groups and its timed events.
 */
export function scenarioOptions(key: MockScenarioKey): Pick<SimulatorOptions<MockWorld>, 'createState' | 'activate'> {
  const scenario: ScenarioDefinition = SCENARIOS[key];
  return {
    createState: scenario.createWorld,
    activate(simulator: Simulator<MockWorld>) {
      const schedule: Schedule = (dueAt, work) => simulator.schedule(dueAt, work);
      scheduleDeadlines(simulator.state, schedule);
      scenario.scheduleEvents?.(simulator.state, schedule);
    },
  };
}
