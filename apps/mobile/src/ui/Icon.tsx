import Svg, { Circle, Path } from 'react-native-svg';

import { colors, type ColorName } from './tokens';

/**
 * The design's icons: 24-point stroke drawings from `docs/design/along/source/helpers.js`,
 * redrawn with react-native-svg so they match the design exactly. Add an icon here, copied from
 * that table, when a screen first needs it.
 */
const ICONS = {
  back: <Path d="m14 5-7 7 7 7" />,
  /** A ride heading somewhere. */
  arrow: <Path d="M5 12h14m-5-5 5 5-5 5" />,
  /** A group, or several ride plans in one place. */
  users: (
    <>
      <Circle cx={9} cy={8} r={3} />
      <Path d="M3 20v-3a6 6 0 0 1 12 0v3m1-15a3 3 0 0 1 0 6m1 3c3 0 4 2 4 5" />
    </>
  ),
  /** Recenter on the device position. */
  locate: (
    <>
      <Circle cx={12} cy={12} r={6} />
      <Circle cx={12} cy={12} r={2} />
      <Path d="M12 1v5m0 12v5M1 12h5m12 0h5" />
    </>
  ),
  /** Send a chat message. */
  send: <Path d="m3 3 19 9-19 9 4-9Zm4 9h15" />,
  /** Settings and demo scenarios. */
  sliders: <Path d="M5 3v4m0 4v10M12 3v10m0 4v4M19 3v4m0 4v10M2 7h6m1 10h6m1-10h6" />,
};

export type IconName = keyof typeof ICONS;

type IconProps = {
  name: IconName;
  /** Defaults to ink. */
  color?: ColorName;
  /** Width and height in points; the design draws 22 inside a 48-point control. Defaults to 22. */
  size?: number;
};

/**
 * A decorative icon, hidden from screen readers: whatever contains it states its meaning in
 * words, like `IconButton`'s `accessibilityLabel`.
 */
export function Icon({ name, color = 'ink', size = 22 }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={colors[color]}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {ICONS[name]}
    </Svg>
  );
}
