import { NEARBY_POLICY, type MapViewport } from '@ride-match/contracts';
import type { Region } from 'react-native-maps';

const HUNDREDTHS = 100;

/**
 * The coarse discovery viewport for a visible map region, or `null` when the region is wider
 * than discovery allows (`NEARBY_POLICY.maxViewportSpanDegrees`), so the screen asks the user to
 * zoom in instead of reading part of the view.
 *
 * Corners are rounded outward to hundredths of a degree, so the viewport covers the whole view
 * and never carries a precise point. Small camera moves inside the same hundredths give the same
 * viewport, which is what keeps discovery from rereading on every pan of a few metres.
 */
export function toViewport(region: Readonly<Region>): MapViewport | null {
  const south = Math.floor((region.latitude - region.latitudeDelta / 2) * HUNDREDTHS);
  const north = Math.ceil((region.latitude + region.latitudeDelta / 2) * HUNDREDTHS);
  const west = Math.floor((region.longitude - region.longitudeDelta / 2) * HUNDREDTHS);
  const east = Math.ceil((region.longitude + region.longitudeDelta / 2) * HUNDREDTHS);
  const maxSpan = Math.round(NEARBY_POLICY.maxViewportSpanDegrees * HUNDREDTHS);
  if (north - south > maxSpan || east - west > maxSpan) return null;
  if (south < -90 * HUNDREDTHS || north > 90 * HUNDREDTHS || west < -180 * HUNDREDTHS || east > 180 * HUNDREDTHS)
    return null;
  return {
    southWest: { latitude: south / HUNDREDTHS, longitude: west / HUNDREDTHS },
    // A region of zero size still gets a viewport one hundredth across.
    northEast: { latitude: Math.max(north, south + 1) / HUNDREDTHS, longitude: Math.max(east, west + 1) / HUNDREDTHS },
  };
}

/**
 * The map region discovery reads: the reported region with its height worked out from its width
 * and the map frame's proportions, so it covers the whole frame whatever the map padding.
 *
 * Google Maps (Android) reports only the part inside the map padding, so its latitude span
 * changed with the sheet's height. A sheet that grew while a view was read ("Outside the demo
 * area" against "Updating for this area…") then changed the viewport, which started another
 * read, which changed the sheet back: an endless loop of reads (VERIFY-005). The padding is
 * vertical, so the longitude span is stable; Apple Maps already reports the whole frame, which
 * this matches. Without a measured frame the region is returned as it is.
 *
 * @param region The region the map last came to rest on.
 * @param frame The map view's size in points, or zero before it is laid out.
 */
export function discoveryRegion(region: Readonly<Region>, frame: { width: number; height: number }): Region {
  if (frame.width <= 0 || frame.height <= 0) return region;
  // On a Mercator map, a degree of latitude is shorter on screen by the cosine of the latitude.
  const latitudeDelta =
    region.longitudeDelta * (frame.height / frame.width) * Math.cos((region.latitude * Math.PI) / 180);
  return { ...region, latitudeDelta };
}
