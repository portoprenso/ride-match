import {
  GROUP_POLICY,
  RIDE_POLICY,
  type CoordinatesDto,
  type DepartureOffsetMinutes,
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

type RideSeed = {
  rider: string;
  area: keyof typeof AREAS;
  /** The exact origin's offset from the area's center in degrees (latitude, longitude), well inside the area. */
  offset: readonly [number, number];
  destination: string;
  createdSecondsAgo: number;
  departureOffsetMinutes: DepartureOffsetMinutes;
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
};

const ACTIVE_SOLO_RIDES: readonly RideSeed[] = [
  { rider: 'Aida', area: 'asanbay', offset: [0.0021, -0.0018], destination: 'place_asia_mall', createdSecondsAgo: 120, departureOffsetMinutes: 5 },
  // Reaches its 15-minute deadline 20 seconds after activation.
  { rider: 'Bakyt', area: 'dzhal', offset: [-0.0016, 0.0024], destination: 'place_ala_too', createdSecondsAgo: 880, departureOffsetMinutes: 0 },
  { rider: 'Cholpon', area: 'vostok5', offset: [0.0012, 0.0019], destination: 'place_manas_airport', createdSecondsAgo: 300, departureOffsetMinutes: 10 },
  { rider: 'Daniyar', area: 'alamedin1', offset: [-0.0022, -0.0011], destination: 'place_bishkek_park', createdSecondsAgo: 45, departureOffsetMinutes: 0 },
  { rider: 'Elnura', area: 'kokZhar', offset: [0.0015, 0.0023], destination: 'place_vefa_center', createdSecondsAgo: 540, departureOffsetMinutes: 5 },
  { rider: 'Farkhat', area: 'oshBazaar', offset: [-0.0019, 0.0014], destination: 'place_dordoi_plaza', createdSecondsAgo: 200, departureOffsetMinutes: 10 },
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
  const area = AREAS[seed.area];
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
}

/** Scenario A: six solo rides and two groups (one forming with three members, one ready with two). */
function createActiveNeighborhood({ now, ids }: SeedContext): MockWorld {
  const world = createEmptyWorld(now);
  for (const seed of ACTIVE_SOLO_RIDES) {
    const ride = buildRide(world, ids, seed, now - seed.createdSecondsAgo * SECOND, { status: 'active', groupId: null });
    world.rides.set(ride.id, ride);
  }
  for (const seed of ACTIVE_GROUPS) addGroup(world, ids, seed, now);
  return world;
}

/** Scenario A's timed event: a new ride appears after 8 seconds (the expiry at 20 seconds is a seeded deadline). */
function scheduleActiveNeighborhood(world: MockWorld, schedule: Schedule): void {
  const appearsAt = world.activatedAt + APPEARS_AFTER_MS;
  schedule(appearsAt, (context) =>
    admitRide(context, buildRide(context.state, context.ids, APPEARING_RIDE, appearsAt, { status: 'active', groupId: null })),
  );
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
