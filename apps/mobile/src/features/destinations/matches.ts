import type { MatchLevel, MatchPreviewDto, NearbyItemDto } from '@ride-match/contracts';

import { itemKey } from '../discovery/nearbyItems';

/** The source's match previews for the shown snapshot, by item key (`itemKey`). */
export type MatchIndex = ReadonlyMap<string, MatchPreviewDto>;

/** Indexes a snapshot's `previews` by their target's item key. */
export function indexMatches(previews: readonly MatchPreviewDto[]): MatchIndex {
  return new Map(previews.map((preview) => [itemKey(preview.target), preview]));
}

const RANK: Record<MatchLevel, number> = { excellent: 0, good: 1, possible: 2 };

/** "Excellent match", "Good match" or "Possible match": the supplied level, never a score. */
export function matchLabel(level: MatchLevel): string {
  return `${level[0]!.toUpperCase()}${level.slice(1)} match`;
}

/**
 * The item to inspect first for a destination: the highest supplied level, and among equals the
 * one the source listed first (nearest the view's centre). `null` when nothing matches.
 */
export function bestMatch(
  items: readonly NearbyItemDto[],
  matches: MatchIndex,
): { item: NearbyItemDto; match: MatchPreviewDto } | null {
  let best: { item: NearbyItemDto; match: MatchPreviewDto } | null = null;
  for (const item of items) {
    const match = matches.get(itemKey(item));
    if (match !== undefined && (best === null || RANK[match.level] < RANK[best.match.level])) best = { item, match };
  }
  return best;
}
