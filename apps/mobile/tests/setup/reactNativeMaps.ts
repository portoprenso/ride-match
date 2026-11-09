/*
 * react-native-maps draws native views that Jest cannot render, so every test gets this stand-in.
 * `MapView`, `Marker` and `Circle` render plain views that keep their props, so tests read the
 * camera's initial region, the padding, the markers' labels and the circle's radius from them.
 * A map reports itself ready right after mounting. Camera moves are recorded by the shared
 * `animateToRegion` mock (`jest.requireMock('react-native-maps').animateToRegion`), and marker
 * redraws by the shared `redrawMarker` mock, both reset by `clearMocks` before every test. The
 * point under a screen position comes from the shared `coordinateForPoint` mock, which answers
 * Ala-Too Square's point unless a test sets another answer. The shared `getMapBoundaries` mock
 * fails, so the stand-in never reports where an app-made camera move ended, unless a test sets
 * `boundsOfLastMove` as its answer (the bounds of the last `animateToRegion` target, as a map
 * that finished that move would report). Nothing here draws or checks real map tiles.
 */
type MockStandInProps = {
  children?: import('react').ReactNode;
  onMapReady?: () => void;
  ref?: import('react').Ref<unknown>;
} & Record<string, unknown>;

jest.mock('react-native-maps', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const animateToRegion = jest.fn();
  const redrawMarker = jest.fn();
  const coordinateForPoint = jest.fn(async () => ({ latitude: 42.8765, longitude: 74.6037 }));
  type MockRegion = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
  const getMapBoundaries = jest.fn(async (): Promise<unknown> => {
    throw new Error('The stand-in map does not report its bounds.');
  });
  const boundsOfLastMove = async () => {
    const last = animateToRegion.mock.calls.at(-1)?.[0] as MockRegion | undefined;
    if (last === undefined) throw new Error('The stand-in map has not moved.');
    const [halfLat, halfLng] = [last.latitudeDelta / 2, last.longitudeDelta / 2];
    return {
      northEast: { latitude: last.latitude + halfLat, longitude: last.longitude + halfLng },
      southWest: { latitude: last.latitude - halfLat, longitude: last.longitude - halfLng },
    };
  };

  function MapView({ ref, onMapReady, ...props }: MockStandInProps) {
    React.useImperativeHandle(ref, () => ({ animateToRegion, coordinateForPoint, getMapBoundaries }), []);
    // Ready once, on mounting, as the native map reports it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => onMapReady?.(), []);
    return React.createElement(View, props);
  }
  function Marker({ ref, ...props }: MockStandInProps) {
    React.useImperativeHandle(ref, () => ({ redraw: redrawMarker }), []);
    return React.createElement(View, { testID: 'map-marker', ...props });
  }
  function Circle(props: MockStandInProps) {
    return React.createElement(View, { testID: 'map-circle', ...props });
  }

  return {
    __esModule: true,
    default: MapView,
    Marker,
    Circle,
    animateToRegion,
    redrawMarker,
    coordinateForPoint,
    getMapBoundaries,
    boundsOfLastMove,
  };
});
