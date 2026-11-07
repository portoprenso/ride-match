/*
 * react-native-maps draws native views that Jest cannot render, so every test gets this stand-in.
 * `MapView`, `Marker` and `Circle` render plain views that keep their props, so tests read the
 * camera's initial region, the padding, the markers' labels and the circle's radius from them.
 * A map reports itself ready right after mounting. Camera moves are recorded by the shared
 * `animateToRegion` mock (`jest.requireMock('react-native-maps').animateToRegion`), and marker
 * redraws by the shared `redrawMarker` mock, both reset by `clearMocks` before every test. Nothing here draws or checks real map tiles.
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

  function MapView({ ref, onMapReady, ...props }: MockStandInProps) {
    React.useImperativeHandle(ref, () => ({ animateToRegion }), []);
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

  return { __esModule: true, default: MapView, Marker, Circle, animateToRegion, redrawMarker };
});
