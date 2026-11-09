import { act, renderHook } from '@testing-library/react-native';
import type MapView from 'react-native-maps';

import { PADDING_REPEAT_WINDOW_MS, streetRegion, useHomeCamera } from '../src/features/map/mapCamera';

/*
 * The home camera's repeat of an app-made move after a padding change (VERIFY-005): on Android,
 * react-native-maps keeps the camera in place when the padding changes, cancelling the move.
 */

const TARGET = streetRegion({ latitude: 42.87, longitude: 74.6 });

async function setup() {
  const animateToRegion = jest.fn();
  const camera = await renderHook(() => useHomeCamera({ fix: null, pickup: null }));
  camera.result.current.mapRef.current = {
    animateToRegion,
    getMapBoundaries: () => Promise.reject(new Error('No bounds in this test.')),
  } as unknown as MapView;
  await act(async () => camera.result.current.onMapReady());
  return { camera, animateToRegion };
}

describe('home camera padding repeat', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('repeats a move the app just made when the padding changes', async () => {
    const { camera, animateToRegion } = await setup();
    await act(async () => camera.result.current.moveTo(TARGET));
    await act(async () => camera.result.current.onPaddingChanged());
    expect(animateToRegion.mock.calls.map(([region]) => region)).toEqual([TARGET, TARGET]);
  });

  it('repeats nothing after the user touched the map or once the window has passed', async () => {
    const { camera, animateToRegion } = await setup();
    await act(async () => camera.result.current.moveTo(TARGET));
    await act(async () => camera.result.current.onUserGesture());
    await act(async () => camera.result.current.onPaddingChanged());
    expect(animateToRegion).toHaveBeenCalledTimes(1);

    await act(async () => camera.result.current.moveTo(TARGET));
    await act(async () => jest.advanceTimersByTime(PADDING_REPEAT_WINDOW_MS + 1));
    await act(async () => camera.result.current.onPaddingChanged());
    expect(animateToRegion).toHaveBeenCalledTimes(2);
  });
});
