import { Text, type TextProps } from 'react-native';

import { colors, typography, type ColorName, type TextVariant } from './tokens';

type AppTextProps = TextProps & {
  /** Named type style. Defaults to `body`. */
  variant?: TextVariant;
  /** Palette color. Defaults to `ink`. */
  color?: ColorName;
};

/**
 * Text set in the app's Manrope type scale.
 *
 * Use it instead of `Text` for app copy. Each variant selects an embedded Manrope face, so
 * do not pass `fontFamily` or `fontWeight` in `style`; layout styles such as alignment are
 * fine. Font scaling stays enabled, so surrounding layouts must let text wrap or grow
 * rather than clip it. Roles are not implied: pass `accessibilityRole="header"` for titles.
 *
 * The faces exist only in development builds made after UI-001-A, which embed them at build
 * time. An older build falls back to the system font.
 */
export function AppText({ variant = 'body', color = 'ink', style, ...rest }: AppTextProps) {
  return <Text {...rest} style={[typography[variant], { color: colors[color] }, style]} />;
}
