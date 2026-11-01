import type { Id, ManualLocationInput, PlaceDto } from '@ride-match/contracts';
import { createContext, use, useMemo, useState, type ReactNode } from 'react';

/**
 * A pickup point the user chose by name and explicitly confirmed, for the ride request draft
 * (RIDE-001-B). Its location is the place's own point with `source: 'manual'`: it says where
 * the user will be, never where the device is. It is frozen, so it stays exactly as confirmed.
 *
 * Private once it becomes a request's origin: keep it on the device until the user creates the
 * request, and never log it or put it in analytics.
 */
export type ConfirmedPickup = Readonly<{
  placeId: Id;
  label: string;
  detail: string | null;
  location: Readonly<ManualLocationInput>;
}>;

/** The confirmed pickup for a chosen place. */
export function toConfirmedPickup(place: PlaceDto): ConfirmedPickup {
  return Object.freeze({
    placeId: place.id,
    label: place.label,
    detail: place.detail,
    location: Object.freeze({ source: 'manual', coordinates: Object.freeze({ ...place.coordinates }) }),
  });
}

/**
 * What the user decided about location during this launch. Nothing is stored on the device: a
 * new launch asks again while the permission was never requested, and the pickup is chosen
 * again for a new request.
 */
export type LocationChoices = {
  /** The user chose "Choose an area instead", so the introduction stays closed for this launch. */
  introSetAside: boolean;
  setIntroAside(): void;
  /** The confirmed named pickup point, or `null` while none was confirmed. */
  pickup: ConfirmedPickup | null;
  /** Replaces the pickup with the given place, which the user has just confirmed. */
  confirmPickup(place: PlaceDto): void;
};

const LocationChoicesContext = createContext<LocationChoices | null>(null);

/** Keeps the location choices for the screens below it, once per launch. */
export function LocationChoicesProvider({ children }: { children: ReactNode }) {
  const [introSetAside, setIntroSetAside] = useState(false);
  const [pickup, setPickup] = useState<ConfirmedPickup | null>(null);
  const choices = useMemo<LocationChoices>(
    () => ({
      introSetAside,
      setIntroAside: () => setIntroSetAside(true),
      pickup,
      confirmPickup: (place) => setPickup(toConfirmedPickup(place)),
    }),
    [introSetAside, pickup],
  );
  return <LocationChoicesContext value={choices}>{children}</LocationChoicesContext>;
}

/**
 * Returns this launch's location choices.
 *
 * @throws {Error} Outside a {@link LocationChoicesProvider}, which is a programming error.
 */
export function useLocationChoices(): LocationChoices {
  const choices = use(LocationChoicesContext);
  if (choices === null) throw new Error('useLocationChoices() must be called inside a LocationChoicesProvider.');
  return choices;
}
