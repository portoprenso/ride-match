import type { CoordinatesDto, Id, ManualLocationInput, PlaceDto } from '@ride-match/contracts';
import { createContext, use, useMemo, useState, type ReactNode } from 'react';

/**
 * A pickup point the user chose and explicitly confirmed, for the ride request draft
 * (RIDE-001-B). Its location has `source: 'manual'`: it says where the user will be, never where
 * the device is. It is frozen, so it stays exactly as confirmed.
 *
 * - `place`: a curated place chosen by name; the location is the place's own point.
 * - `map-point`: the point under the map's centre pin (MAP-001-B); `label` and `detail` name the
 *   nearest curated place, or are `null` when none is close, and `placeId` is `null`.
 *
 * Private once it becomes a request's origin: keep it on the device until the user creates the
 * request, and never log it or put it in analytics.
 */
export type ConfirmedPickup = Readonly<{
  kind: 'place' | 'map-point';
  placeId: Id | null;
  label: string | null;
  detail: string | null;
  location: Readonly<ManualLocationInput>;
}>;

function manualLocation(coordinates: Readonly<CoordinatesDto>): Readonly<ManualLocationInput> {
  return Object.freeze({
    source: 'manual',
    coordinates: Object.freeze({ latitude: coordinates.latitude, longitude: coordinates.longitude }),
  });
}

/** The confirmed pickup for a chosen place. */
export function toConfirmedPickup(place: PlaceDto): ConfirmedPickup {
  return Object.freeze({
    kind: 'place',
    placeId: place.id,
    label: place.label,
    detail: place.detail,
    location: manualLocation(place.coordinates),
  });
}

/**
 * The confirmed pickup for a point chosen on the map.
 *
 * @param coordinates - The exact point under the pin.
 * @param near - The nearest curated place, used only for its name, or `null`.
 */
export function toMapPointPickup(coordinates: Readonly<CoordinatesDto>, near: PlaceDto | null): ConfirmedPickup {
  return Object.freeze({
    kind: 'map-point',
    placeId: null,
    label: near?.label ?? null,
    detail: near?.detail ?? null,
    location: manualLocation(coordinates),
  });
}

/** How a confirmed pickup is named on screen, such as "Near Ala-Too Square". */
export function describePickup(pickup: ConfirmedPickup): string {
  return pickup.label !== null ? `Near ${pickup.label}` : 'A point you chose on the map';
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
  /** Replaces the pickup with a point the user has just confirmed on the map. */
  confirmMapPoint(coordinates: Readonly<CoordinatesDto>, near: PlaceDto | null): void;
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
      confirmMapPoint: (coordinates, near) => setPickup(toMapPointPickup(coordinates, near)),
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
