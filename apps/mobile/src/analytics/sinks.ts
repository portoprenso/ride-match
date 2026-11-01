import type { AppEnvironment } from '../config/appConfig';
import type { AnalyticsEvent } from './createAnalytics';

/** Where validated events go. No sink sends anything off the device in the mobile MVP. */
export type AnalyticsSink = {
  record(event: AnalyticsEvent): void;
};

/** Discards every event. */
export const noopSink: AnalyticsSink = { record() {} };

/** A sink that keeps recent events in memory, so development tools and tests can inspect them. */
export type MemorySink = AnalyticsSink & {
  /** The kept events, oldest first. */
  events(): readonly AnalyticsEvent[];
  clear(): void;
};

/** @param limit How many events to keep; the oldest are dropped first. */
export function createMemorySink(limit = 500): MemorySink {
  let kept: AnalyticsEvent[] = [];
  return {
    record(event) {
      kept = [...kept.slice(Math.max(0, kept.length - limit + 1)), event];
    },
    events: () => kept,
    clear() {
      kept = [];
    },
  };
}

/** The sink a build uses: in memory for development and preview, so events can be inspected; none in production. */
export function selectAnalyticsSink(environment: AppEnvironment): AnalyticsSink {
  return environment === 'production' ? noopSink : createMemorySink();
}
