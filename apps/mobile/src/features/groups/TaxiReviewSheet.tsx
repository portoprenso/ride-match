import { StyleSheet, View } from 'react-native';

import { ActionFooter } from '../../ui/ActionFooter';
import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { SheetContent } from '../../ui/SheetHost';
import { colors, radii, spacing } from '../../ui/tokens';
import type { ReviewedPlace, TaxiReview, TaxiReviewProblem, TaxiReviewResult } from './taxiReview';

/** Why the group screen can't offer a taxi review, in the rider's words. */
export function describeTaxiProblem(problem: TaxiReviewProblem): string {
  switch (problem) {
    case 'not-ready':
      return 'Your group is no longer ready, so Yandex Go can’t open from here.';
    case 'no-meeting-point':
      return 'Your group has no meeting point right now, so Yandex Go can’t open from here.';
    case 'invalid-places':
    case 'same-place':
      return 'These trip details can’t be sent to Yandex Go. Check the meeting point in chat.';
  }
}

/**
 * The trip details a rider may copy or share after Yandex Go couldn't open: the two places by
 * name and coordinates, so the trip can be entered by hand. They are the group's member-only
 * places, so this text only leaves the app through the rider's own share action.
 */
export function describeTripForSharing(review: TaxiReview): string {
  const place = (role: string, { label, coordinates }: ReviewedPlace) =>
    `${role}: ${label} (${coordinates.latitude}, ${coordinates.longitude})`;
  return [place('Pickup', review.pickup), place('Destination', review.destination)].join('\n');
}

type TaxiReviewSheetProps = {
  review: TaxiReview;
  /** The review the group as now read allows; when it isn't `review`, the rider reviews again. */
  current: TaxiReviewResult;
  /** The last attempt to open Yandex Go failed (design 38). */
  failed: boolean;
  /** An attempt is in progress; the actions wait for it. */
  opening: boolean;
  /** A short result of the last copy-or-share attempt, or `null`. */
  shareMessage: string | null;
  onOpen: () => void;
  onOpenWebsite: () => void;
  onShare: () => void;
  /** Replaces the review with the current one. */
  onReviewAgain: (review: TaxiReview) => void;
  onBack: () => void;
};

/**
 * The taxi review (design 17) and its failure (38), as the content of the group screen's sheet.
 *
 * - **Review:** the pickup (the meeting point) and destination that the Yandex Go link will
 *   carry, as last read from the source, with what opening means: booking and payment happen in
 *   Yandex Go, other destinations are agreed outside the app, and returning keeps the group ready.
 * - **Changed:** if the group changes while the sheet is open (another point, destination or
 *   status), the old details are not offered for opening: the rider reviews the current ones, or
 *   goes back when the group can no longer open a taxi.
 * - **Failed:** the group is still ready and nothing was booked; the rider may try again, use the
 *   website link, or copy or share the trip details through the system share sheet.
 *
 * It only shows; opening, sharing and analytics are the group screen's.
 */
export function TaxiReviewSheet({
  review,
  current,
  failed,
  opening,
  shareMessage,
  onOpen,
  onOpenWebsite,
  onShare,
  onReviewAgain,
  onBack,
}: TaxiReviewSheetProps) {
  const back = <Button label="Back to group" variant="ghost" onPress={onBack} disabled={opening} />;

  if (!current.ok || current.review.meetingPointId !== review.meetingPointId || !samePlaces(current.review, review)) {
    return (
      <SheetContent
        footer={
          <ActionFooter>
            {current.ok ? <Button label="Review new details" onPress={() => onReviewAgain(current.review)} /> : null}
            {back}
          </ActionFooter>
        }
      >
        <View style={styles.heading} accessibilityLiveRegion="polite">
          <AppText variant="section" accessibilityRole="header">
            The trip details changed.
          </AppText>
          <AppText color="muted">
            {current.ok
              ? 'Your group’s meeting point or destination changed. Review the new details before opening Yandex Go.'
              : describeTaxiProblem(current.problem)}
          </AppText>
        </View>
      </SheetContent>
    );
  }

  const places = (
    <View style={styles.places}>
      <PlaceRow place={review.pickup} role="Pickup" />
      <PlaceRow place={review.destination} role="Destination" />
    </View>
  );

  if (failed) {
    return (
      <SheetContent
        footer={
          <ActionFooter>
            <Button label="Try opening again" busy={opening} onPress={onOpen} />
            <Button label="Use browser fallback" variant="secondary" disabled={opening} onPress={onOpenWebsite} />
            <Button label="Copy or share trip details" variant="ghost" disabled={opening} onPress={onShare} />
            {back}
          </ActionFooter>
        }
      >
        <View style={styles.heading}>
          <AppText variant="section" accessibilityRole="header" accessibilityLiveRegion="assertive">
            Couldn’t open Yandex Go.
          </AppText>
          <AppText color="muted">Your group is still ready. No booking or payment was made in Along.</AppText>
        </View>
        {places}
        {shareMessage === null ? null : (
          <View accessibilityLiveRegion="polite">
            <Notice message={shareMessage} />
          </View>
        )}
        <Notice message="Continue with the supported browser or app-store fallback on your device." />
      </SheetContent>
    );
  }

  return (
    <SheetContent
      footer={
        <ActionFooter>
          <Button label="Open Yandex Go" busy={opening} onPress={onOpen} />
          {back}
        </ActionFooter>
      }
    >
      <View style={styles.heading}>
        <AppText variant="section" accessibilityRole="header">
          One last look.
        </AppText>
        <AppText color="muted">These trip details will be sent to Yandex Go.</AppText>
      </View>
      {places}
      <Notice message="Booking and payment happen in Yandex Go. Agree on any different individual destinations outside Along." />
      <Notice message="Returning here keeps your group ready. Only the coordinator can mark the group complete." />
    </SheetContent>
  );
}

function samePlaces(one: TaxiReview, other: TaxiReview): boolean {
  const same = (a: ReviewedPlace, b: ReviewedPlace) =>
    a.coordinates.latitude === b.coordinates.latitude && a.coordinates.longitude === b.coordinates.longitude;
  return same(one.pickup, other.pickup) && same(one.destination, other.destination);
}

function PlaceRow({ place, role }: { place: ReviewedPlace; role: string }) {
  return (
    <View style={styles.row}>
      <AppText variant="label">{place.label}</AppText>
      <AppText variant="small" color="muted">
        {role}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  places: {
    gap: spacing.sm,
  },
  row: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: colors.soft,
  },
});
