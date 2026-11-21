import { Platform, Text, useWindowDimensions, type TextProps } from 'react-native';

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
 * At enlarged Android text sizes, use the font's native line metrics: Android's nonlinear
 * scaling can make a separately scaled design line height too short for the glyphs. Window
 * dimensions keep this policy current when the system font setting changes. Normal-size
 * Android and iOS retain the design leading; explicit caller styles still take precedence.
 *
 * The faces exist only in development builds made after UI-001-A, which embed them at build
 * time. An older build falls back to the system font.
 */
export function AppText({ variant = 'body', color = 'ink', style, ...rest }: AppTextProps) {
  const { fontScale } = useWindowDimensions();
  const nativeLineHeight = Platform.OS === 'android' && fontScale > 1 &&
    rest.allowFontScaling !== false && rest.maxFontSizeMultiplier !== 1;
  const typeStyle = nativeLineHeight
    ? { ...typography[variant], lineHeight: undefined }
    : typography[variant];

  return <Text {...rest} style={[typeStyle, { color: colors[color] }, style]} />;
}
