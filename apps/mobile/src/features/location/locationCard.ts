import type { BadgeTone } from '../../ui/Badge';
import type { LocationStatus } from '../../platform/location/createLocationController';

/**
 * The second action a location card offers, beside choosing a pickup point by name:
 *
 * - `request`: show the OS permission prompt.
 * - `app-settings` / `services-settings`: open the system settings (see `openLocationSettings`).
 * - `refresh`: request a fresh fix.
 */
export type LocationCardAction =
  | { kind: 'request'; label: string }
  | { kind: 'app-settings'; label: string }
  | { kind: 'services-settings'; label: string }
  | { kind: 'refresh'; label: string };

/** What the home location card says. Choosing a pickup point by name is always offered. */
export type LocationCardContent = {
  badge: { label: string; tone: BadgeTone };
  title: string;
  message: string;
  action: LocationCardAction | null;
};

const CHOOSE_INSTEAD = "Choose a place for your pickup. We won't assume it's your current location.";

/**
 * The home card for a location status (screens 01 and 21), or `null` when location needs no
 * explanation: while the permission is read, or with a fresh or recent, precise and accurate
 * fix (the map shows it). Every card keeps a named pickup available, so the app never depends
 * on the device position and never invents one.
 *
 * Location services that are off come first, before a denial (iOS reports them as a denial).
 * iOS has no public link to its location switch, so its message names the path instead.
 *
 * @param platform Decides the services wording, as `Platform.OS` reports it.
 */
export function describeLocationCard(status: LocationStatus, platform: string): LocationCardContent | null {
  switch (status.kind) {
    case 'checking':
      return null;
    case 'needs-permission':
      return {
        badge: { label: 'Location not in use', tone: 'neutral' },
        title: 'Browse from an area.',
        message: CHOOSE_INSTEAD,
        action: { kind: 'request', label: 'Use my location' },
      };
    case 'denied':
      return {
        badge: { label: 'Location is off', tone: 'warning' },
        title: 'Browse from an area.',
        message: CHOOSE_INSTEAD,
        action: status.canAskAgain
          ? { kind: 'request', label: 'Allow location' }
          : { kind: 'app-settings', label: 'Open device settings' },
      };
    case 'unavailable':
      return describeUnavailable(status.reason, platform);
    case 'locating':
      return {
        badge: { label: 'Finding your location', tone: 'neutral' },
        title: 'Looking for your position.',
        message: 'This can take a few seconds. You can also choose a place for your pickup.',
        action: null,
      };
    case 'located': {
      const { fix, assessment } = status;
      if (fix.approximate) {
        return {
          badge: { label: 'Approximate location', tone: 'warning' },
          title: 'Choose your pickup point.',
          message:
            "Your location is only approximate, so it can't be your pickup point. Choose a place, or turn on precise location in the device settings.",
          action: { kind: 'app-settings', label: 'Open device settings' },
        };
      }
      if (!assessment.accurate) {
        return {
          badge: { label: 'Location not precise', tone: 'warning' },
          title: 'Choose your pickup point.',
          message:
            fix.accuracyMeters === null
              ? "Your device didn't say how accurate your location is, so it can't be your pickup point. Try again, or choose a place."
              : `Your location is only accurate to about ${Math.round(fix.accuracyMeters)} m, too rough for a pickup point. Try again, or choose a place.`,
          action: { kind: 'refresh', label: 'Try again' },
        };
      }
      if (assessment.age === 'stale') {
        return {
          badge: { label: 'Location out of date', tone: 'warning' },
          title: 'Your location is out of date.',
          message: 'Your last position is more than two minutes old. Refresh it, or choose a place for your pickup.',
          action: { kind: 'refresh', label: 'Refresh location' },
        };
      }
      return null;
    }
  }
}

function describeUnavailable(
  reason: Extract<LocationStatus, { kind: 'unavailable' }>['reason'],
  platform: string,
): LocationCardContent {
  switch (reason) {
    case 'services-off':
      return {
        badge: { label: 'Location services are off', tone: 'warning' },
        title: 'Browse from an area.',
        message:
          platform === 'ios'
            ? 'Location Services are off on this device. Turn them on in Settings, Privacy & Security, Location Services, or choose a place for your pickup.'
            : 'Location is off on this device. Turn it on in the device settings, or choose a place for your pickup.',
        action: { kind: 'services-settings', label: 'Open device settings' },
      };
    case 'no-fix':
      return {
        badge: { label: 'No location yet', tone: 'warning' },
        title: "We couldn't find you.",
        message: "Your device didn't report a position in time. Try again, or choose a place for your pickup.",
        action: { kind: 'refresh', label: 'Try again' },
      };
    case 'check-failed':
      return {
        badge: { label: 'Location unavailable', tone: 'warning' },
        title: 'Browse from an area.',
        message:
          "Your device didn't say whether location is allowed. We'll check again when you come back to the app. Meanwhile, choose a place for your pickup.",
        action: null,
      };
  }
}
