import type { JoinTargetDto } from '@ride-match/contracts';
import { AppState } from 'react-native';

import type { AppEnvironment, DataSourceConfig } from '../config/appConfig';
import type { AppStateSource } from '../platform/appState';
import {
  AnalyticsEventError,
  validateEvent,
  type AnalyticsEventName,
  type AnalyticsProperties,
  type EventStage,
  type PropertiesArgument,
} from './events';
import type { AnalyticsSink } from './sinks';

/** A return to the foreground after at least this long in the background starts a new session. */
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
/** How long a peer marker must stay visible in the foreground before it counts as seen. */
export const MARKER_DWELL_MS = 1000;

/**
 * Who and what produced an event, added to every event. Identities are pseudonymous: an
 * installation ID and the source's user ID, never a phone number.
 *
 * `synthetic` is true whenever the app runs on the mock data source, so demo and scenario
 * traffic can always be told apart from real use (see {@link isRealUserEvent}).
 */
export type AnalyticsContext = {
  environment: AppEnvironment;
  appVersion: string;
  /** The mock scenario key, or `null` on a real data source. */
  mockScenario: string | null;
  synthetic: boolean;
  installationId: string | null;
  userId: string | null;
};

/** One recorded event. */
export type AnalyticsEvent = {
  [Name in AnalyticsEventName]: {
    name: Name;
    stage: EventStage;
    properties: AnalyticsProperties<Name>;
    sessionId: string;
    /** Order of the event since the client started. */
    sequence: number;
    occurredAt: string;
    context: AnalyticsContext;
  };
}[AnalyticsEventName];

/** Whether an event may count in real-user metrics: a production build on a real data source. */
export function isRealUserEvent(event: AnalyticsEvent): boolean {
  return !event.context.synthetic && event.context.environment === 'production';
}

export type AnalyticsOptions = {
  sink: AnalyticsSink;
  environment: AppEnvironment;
  appVersion: string;
  /** The configured data source; the mock one marks every event synthetic and names its scenario. */
  dataSource: DataSourceConfig;
  /** A pseudonymous ID of this installation, once one is stored; `null` until then. */
  installationId?: string | null;
  appState?: AppStateSource;
  /** Device time in milliseconds; `Date.now` unless a test passes its own. */
  now?: () => number;
  createSessionId?: () => string;
};

/**
 * The typed analytics boundary. Feature code tracks catalog events only (`events.ts`); each
 * is validated, given the session and context, and handed to the sink.
 *
 * Sessions: `start()` begins the first one with `app_opened`. Returning to the foreground
 * after {@link SESSION_TIMEOUT_MS} or more in the background begins a new one; a shorter
 * absence, or iOS `inactive`, continues it.
 */
export type Analytics = {
  /** Begins the first session (now, or on the first return to the foreground) and follows the app state. Calling it again does nothing. */
  start(): void;
  /**
   * Records an event.
   *
   * @throws {AnalyticsEventError} Before `start`, or for an event that breaks the catalog. Such
   *   an event is never recorded: an unexpected property may be private data.
   */
  track<Name extends AnalyticsEventName>(name: Name, ...properties: PropertiesArgument<Name>): void;
  /** Records the event once per session, such as `map_opened` when the map first shows. */
  trackOncePerSession<Name extends AnalyticsEventName>(name: Name, ...properties: PropertiesArgument<Name>): void;
  /**
   * Records the event once per `key` while the app runs, such as `ride_request_expired` once
   * per request or `match_found` once per match and version. The key stays on the device.
   */
  trackOnce<Name extends AnalyticsEventName>(key: string, name: Name, ...properties: PropertiesArgument<Name>): void;
  /**
   * Reports that a peer's marker (not a cluster, not the user's own) is visible. After
   * {@link MARKER_DWELL_MS} of foreground visibility it records `nearby_marker_seen` with the
   * target's kind, once per target per session. The target's ID is never recorded.
   */
  markerVisible(target: Pick<JoinTargetDto, 'kind' | 'id'>): void;
  /** Reports that the marker left the screen; an unfinished dwell is cancelled. */
  markerHidden(target: Pick<JoinTargetDto, 'kind' | 'id'>): void;
  /** Sets the pseudonymous user ID added to later events, or `null` after signing out. */
  setUser(userId: string | null): void;
  /** Stops following the app state and cancels dwell timers. Later calls do nothing. */
  dispose(): void;
};

const defaultSessionId = () => `ses_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

type VisibleMarker = { kind: JoinTargetDto['kind']; timer: ReturnType<typeof setTimeout> | null };

export function createAnalytics(options: AnalyticsOptions): Analytics {
  const appState = options.appState ?? AppState;
  const now = options.now ?? Date.now;
  const createSessionId = options.createSessionId ?? defaultSessionId;
  const context: AnalyticsContext = {
    environment: options.environment,
    appVersion: options.appVersion,
    mockScenario: options.dataSource.kind === 'mock' ? options.dataSource.scenario : null,
    synthetic: options.dataSource.kind === 'mock',
    installationId: options.installationId ?? null,
    userId: null,
  };

  let sessionId: string | null = null;
  let backgroundedAt: number | null = null;
  let sequence = 0;
  let started = false;
  let disposed = false;
  let appStateSubscription: { remove(): void } | null = null;
  const sessionOnce = new Set<string>();
  const launchOnce = new Set<string>();
  const seenMarkers = new Set<string>();
  const visibleMarkers = new Map<string, VisibleMarker>();

  const markerKey = (target: Pick<JoinTargetDto, 'kind' | 'id'>) => `${target.kind}:${target.id}`;

  function record(name: AnalyticsEventName, properties: unknown) {
    if (disposed) return;
    if (sessionId === null) throw new AnalyticsEventError(`Event "${name}" was tracked before analytics started.`);
    const validated = validateEvent(name, properties);
    sequence += 1;
    options.sink.record({
      name,
      stage: validated.stage,
      properties: validated.properties,
      sessionId,
      sequence,
      occurredAt: new Date(now()).toISOString(),
      context: { ...context },
    } as AnalyticsEvent);
  }

  function armDwell(key: string, marker: VisibleMarker) {
    if (marker.timer !== null || seenMarkers.has(key) || backgroundedAt !== null || sessionId === null) return;
    marker.timer = setTimeout(() => {
      marker.timer = null;
      seenMarkers.add(key);
      record('nearby_marker_seen', { kind: marker.kind });
    }, MARKER_DWELL_MS);
  }

  function pauseDwells() {
    for (const marker of visibleMarkers.values()) {
      if (marker.timer !== null) clearTimeout(marker.timer);
      marker.timer = null;
    }
  }

  function beginSession() {
    sessionId = createSessionId();
    sessionOnce.clear();
    seenMarkers.clear();
    record('app_opened', {});
  }

  function onAppStateChange(next: string) {
    if (next === 'background' && backgroundedAt === null) {
      backgroundedAt = now();
      pauseDwells();
    } else if (next === 'active' && (backgroundedAt !== null || sessionId === null)) {
      const away = backgroundedAt === null ? Infinity : now() - backgroundedAt;
      backgroundedAt = null;
      if (sessionId === null || away >= SESSION_TIMEOUT_MS) beginSession();
      // Markers still on screen start their dwell again, counting only foreground time.
      for (const [key, marker] of visibleMarkers) armDwell(key, marker);
    }
  }

  return {
    start() {
      if (started || disposed) return;
      started = true;
      appStateSubscription = appState.addEventListener('change', onAppStateChange);
      if (appState.currentState === 'background') backgroundedAt = now();
      else beginSession();
    },

    track(name, ...properties) {
      record(name, properties[0] ?? {});
    },

    trackOncePerSession(name, ...properties) {
      if (disposed || sessionOnce.has(name)) return;
      record(name, properties[0] ?? {});
      sessionOnce.add(name);
    },

    trackOnce(key, name, ...properties) {
      if (disposed || launchOnce.has(key)) return;
      record(name, properties[0] ?? {});
      launchOnce.add(key);
    },

    markerVisible(target) {
      if (disposed) return;
      const key = markerKey(target);
      let marker = visibleMarkers.get(key);
      if (marker === undefined) {
        marker = { kind: target.kind, timer: null };
        visibleMarkers.set(key, marker);
      }
      armDwell(key, marker);
    },

    markerHidden(target) {
      const key = markerKey(target);
      const marker = visibleMarkers.get(key);
      if (marker?.timer != null) clearTimeout(marker.timer);
      visibleMarkers.delete(key);
    },

    setUser(userId) {
      context.userId = userId;
    },

    dispose() {
      if (disposed) return;
      pauseDwells();
      visibleMarkers.clear();
      appStateSubscription?.remove();
      appStateSubscription = null;
      disposed = true;
    },
  };
}
