import {
  GROUP_POLICY,
  JoinTargetKindSchema,
  LocationSourceSchema,
  MatchLevelSchema,
  RIDE_POLICY,
  ReportReasonSchema,
} from '@ride-match/contracts';

/*
 * The analytics event catalog (docs/DEVELOPMENT.md, analytics boundary). Every event has a
 * fixed set of bounded properties: enumerations and small whole numbers, never free text, IDs,
 * coordinates, phone numbers, messages, report details, search text or credentials. The types
 * stop such properties at compile time and `validateEvent` at run time.
 */

/** Accepts the values of one property; `description` names them in errors, never the value received. */
type Rule<Value> = {
  readonly description: string;
  accepts(value: unknown): value is Value;
};

function oneOf<const Values extends readonly (string | number)[]>(values: Values): Rule<Values[number]> {
  return {
    description: `one of ${values.join(', ')}`,
    accepts: (value): value is Values[number] => (values as readonly unknown[]).includes(value),
  };
}

function wholeNumber(min: number, max: number): Rule<number> {
  return {
    description: `a whole number from ${min} to ${max}`,
    accepts: (value): value is number => Number.isInteger(value) && (value as number) >= min && (value as number) <= max,
  };
}

const flag: Rule<boolean> = { description: 'true or false', accepts: (value): value is boolean => typeof value === 'boolean' };

/** Buckets for a count of visible activity; `0` means the user saw none. */
export const COUNT_BUCKETS = ['0', '1', '2-5', '6-20', '21+'] as const;
export type CountBucket = (typeof COUNT_BUCKETS)[number];

/** The bucket of a count of visible items, so exposure events never carry an exact count. */
export function countBucket(count: number): CountBucket {
  if (count <= 0) return '0';
  if (count === 1) return '1';
  if (count <= 5) return '2-5';
  if (count <= 20) return '6-20';
  return '21+';
}

/**
 * What an event records:
 *
 * - `view`: something the user saw or opened.
 * - `intent`: something the user asked for, such as pressing Join. It proves nothing happened.
 * - `success`: the source confirmed the user's action. Emit it only from the canonical result,
 *   never because a button was pressed.
 * - `observed`: the source reported a change the user did not cause, such as an expiry.
 */
export type EventStage = 'view' | 'intent' | 'success' | 'observed';

type EventDefinition = { stage: EventStage; properties: Record<string, Rule<unknown>> };

const targetKind = oneOf(JoinTargetKindSchema.options);
const departure = oneOf(RIDE_POLICY.departureOffsetsMinutes);
const pickup = oneOf(LocationSourceSchema.options);
const members = wholeNumber(GROUP_POLICY.minMembers, GROUP_POLICY.capacity);

/** Every analytics event, its stage and its properties. The trigger of each is in docs/DEVELOPMENT.md. */
export const ANALYTICS_EVENTS = {
  app_opened: { stage: 'view', properties: {} },
  map_opened: { stage: 'view', properties: {} },
  nearby_activity_exposed: { stage: 'view', properties: { countBucket: oneOf(COUNT_BUCKETS), truncated: flag } },
  nearby_marker_seen: { stage: 'view', properties: { kind: targetKind } },
  nearby_marker_tapped: { stage: 'intent', properties: { kind: targetKind } },
  destination_selected: { stage: 'intent', properties: {} },
  ride_request_create_clicked: { stage: 'intent', properties: { departureOffsetMinutes: departure, pickup } },
  ride_request_created: { stage: 'success', properties: { departureOffsetMinutes: departure, pickup } },
  ride_request_expired: { stage: 'observed', properties: {} },
  match_found: { stage: 'observed', properties: { level: oneOf(MatchLevelSchema.options), kind: targetKind } },
  group_join_clicked: { stage: 'intent', properties: { kind: targetKind } },
  group_joined: { stage: 'success', properties: { kind: targetKind, memberCount: members } },
  group_leave_clicked: { stage: 'intent', properties: {} },
  group_left: { stage: 'success', properties: {} },
  message_send_clicked: { stage: 'intent', properties: {} },
  message_sent: { stage: 'success', properties: {} },
  meeting_point_viewed: { stage: 'view', properties: {} },
  taxi_open_clicked: { stage: 'intent', properties: {} },
  // The OS accepted the link; it proves neither that the taxi app opened nor a booking.
  taxi_opened: { stage: 'success', properties: {} },
  ride_completed: { stage: 'success', properties: { memberCount: members } },
  user_reported: { stage: 'success', properties: { reason: oneOf(ReportReasonSchema.options) } },
  user_blocked: { stage: 'success', properties: {} },
} as const satisfies Record<string, EventDefinition>;

type Catalog = typeof ANALYTICS_EVENTS;
export type AnalyticsEventName = keyof Catalog;

type RuleValue<R> = R extends Rule<infer Value> ? Value : never;

/** The properties an event takes, all required. */
export type AnalyticsProperties<Name extends AnalyticsEventName> = {
  -readonly [Key in keyof Catalog[Name]['properties']]: RuleValue<Catalog[Name]['properties'][Key]>;
};

/** `track`'s arguments after the name: none for an event without properties, otherwise its properties. */
export type PropertiesArgument<Name extends AnalyticsEventName> =
  keyof AnalyticsProperties<Name> extends never ? [] : [properties: AnalyticsProperties<Name>];

/** Each intent and the success that only the source's confirmation may emit. */
export const INTENT_SUCCESS_PAIRS = [
  ['ride_request_create_clicked', 'ride_request_created'],
  ['group_join_clicked', 'group_joined'],
  ['group_leave_clicked', 'group_left'],
  ['message_send_clicked', 'message_sent'],
  ['taxi_open_clicked', 'taxi_opened'],
] as const satisfies readonly (readonly [AnalyticsEventName, AnalyticsEventName])[];

/** An event that breaks the catalog. Its message names the event and property, never the value. */
export class AnalyticsEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalyticsEventError';
  }
}

const hasOwn = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);

/**
 * Checks an event against the catalog and returns a copy of exactly its properties.
 *
 * @throws {AnalyticsEventError} For an unknown event, a property the event does not define
 *   (such as a coordinate or free text), or a missing or out-of-range value.
 */
export function validateEvent(name: string, properties: unknown = {}): { stage: EventStage; properties: Record<string, unknown> } {
  const definition: EventDefinition | undefined = hasOwn(ANALYTICS_EVENTS, name)
    ? (ANALYTICS_EVENTS as Record<string, EventDefinition>)[name]
    : undefined;
  if (definition === undefined) throw new AnalyticsEventError(`Unknown analytics event "${name}".`);
  if (properties === null || typeof properties !== 'object' || Array.isArray(properties)) {
    throw new AnalyticsEventError(`Event "${name}" needs its properties as an object.`);
  }
  for (const key of Object.keys(properties)) {
    if (!hasOwn(definition.properties, key)) throw new AnalyticsEventError(`Event "${name}" does not accept "${key}".`);
  }
  const accepted: Record<string, unknown> = {};
  for (const [key, rule] of Object.entries(definition.properties)) {
    const value = (properties as Record<string, unknown>)[key];
    if (!rule.accepts(value)) throw new AnalyticsEventError(`Event "${name}" needs "${key}" as ${rule.description}.`);
    accepted[key] = value;
  }
  return { stage: definition.stage, properties: accepted };
}
