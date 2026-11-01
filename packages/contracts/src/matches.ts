import { z } from 'zod';

import { ResourceVersionSchema, TimestampSchema } from './common.js';
import { JoinTargetSchema, hasDistinctTargets, type JoinTargetDto } from './groups.js';

/**
 * Match limits chosen for the mock MVP (CONTRACT-002-B). The schemas enforce them; revisit
 * them before a backend exists.
 */
export const MATCH_POLICY = {
  /** Most matches one request's match set holds. */
  maxMatches: 20,
  /** Largest extra travel time a match may report. */
  maxAdditionalMinutes: 60,
} as const;

/**
 * How well a target fits the viewer's trip, as the source judges it: `possible`, `good` or
 * `excellent`. The app shows the level with words and icons, never as a numeric score.
 */
export const MatchLevelSchema = z.enum(['possible', 'good', 'excellent']);
export type MatchLevel = z.infer<typeof MatchLevelSchema>;

const matchFields = {
  target: JoinTargetSchema,
  level: MatchLevelSchema,
  additionalMinutes: z.int().min(0).max(MATCH_POLICY.maxAdditionalMinutes).nullable(),
};

/** Whether each target appears at most once in a list of matches or previews. */
const hasOneEntryPerTarget = (entries: readonly { target: JoinTargetDto }[]) =>
  hasDistinctTargets(entries.map((entry) => entry.target));

/**
 * Advisory compatibility of one nearby item with a destination the viewer is considering,
 * returned with nearby discovery when it is filtered by destination.
 *
 * - `target` is the nearby item it describes.
 * - `level` is the source's judgement.
 * - `additionalMinutes` is the source's estimate of extra travel time for the shared trip,
 *   a whole number from 0 to 60, or `null` when unknown.
 *
 * A preview reserves no seat and guarantees no join; the join is checked when it happens.
 */
export const MatchPreviewSchema = z.strictObject(matchFields);
export type MatchPreviewDto = z.infer<typeof MatchPreviewSchema>;

/**
 * A ride or group that fits the owner's active request, supplied by the source. The fields
 * are those of `MatchPreviewSchema`, plus `expiresAt`, after which the match no longer
 * holds. A match grants no access to the target's private data and does not guarantee a
 * join. The app reads the target's public projection for details.
 */
export const RideMatchSchema = z.strictObject({
  ...matchFields,
  expiresAt: TimestampSchema,
});
export type RideMatchDto = z.infer<typeof RideMatchSchema>;

/**
 * The owner's current matches (`GET /rides/{rideId}/matches`), owner-only.
 *
 * - `version` is the match set's own version: it increases whenever the set changes, so a
 *   `matches.changed` event that is not newer can be ignored.
 * - `matches` holds at most 20 matches, best first, each target once. Only an active request
 *   has matches; for a grouped, expired or cancelled request the set is empty.
 */
export const RideMatchSetSchema = z.strictObject({
  version: ResourceVersionSchema,
  matches: z
    .array(RideMatchSchema)
    .max(MATCH_POLICY.maxMatches)
    .refine(hasOneEntryPerTarget, { message: 'Expected each target once' }),
});
export type RideMatchSetDto = z.infer<typeof RideMatchSetSchema>;
