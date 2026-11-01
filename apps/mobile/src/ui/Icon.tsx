import Svg, { Circle, Path } from 'react-native-svg';

import { colors, type ColorName } from './tokens';

/**
 * The design's icons: 24-point stroke drawings from `docs/design/along/source/helpers.js`,
 * redrawn with react-native-svg so they match the design exactly. Add an icon here, copied from
 * that table, when a screen first needs it.
 */
const ICONS = {
  /** Recenter on the device position. */
  locate: (
    <>
      <Circle cx={12} cy={12} r={6} />
      <Circle cx={12} cy={12} r={2} />
      <Path d="M12 1v5m0 12v5M1 12h5m12 0h5" />
    </>
  ),
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
