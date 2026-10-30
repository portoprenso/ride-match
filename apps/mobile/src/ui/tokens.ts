import type { TextStyle } from 'react-native';

// Provisional Along design tokens (docs/MOBILE_IMPLEMENTATION_PLAN.md, section C). Change
// values here rather than in components.

export const colors = {
  ink: '#123C38',
  teal: '#146B59',
  lime: '#DDF5A0',
  paper: '#F7F8F2',
  white: '#FFFFFF',
  muted: '#586D68',
  line: '#DCE4DC',
  soft: '#EAF2E9',
  danger: '#AD3E36',
  warning: '#8A5B14',
} as const;

export type ColorName = keyof typeof colors;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radii = { sm: 12, md: 16, lg: 24, xl: 32 } as const;

/**
 * Embedded Manrope faces. Each name is the font's PostScript name and its file name in
 * `assets/fonts`, which `app.config.ts` embeds; keep all three in step.
 */
export const MANROPE = {
  regular: 'Manrope-Regular',
  medium: 'Manrope-Medium',
  semiBold: 'Manrope-SemiBold',
  bold: 'Manrope-Bold',
  extraBold: 'Manrope-ExtraBold',
} as const;

/**
 * Named type styles: size and line height in points, from the design's type scale.
 *
 * Weight comes from the face in `fontFamily`, never from `fontWeight`, so both platforms
 * draw the real Manrope weight instead of a synthesized one. The design's 10-point micro
 * style is left out until something non-essential needs it.
 */
export const typography = {
  display: { fontFamily: MANROPE.extraBold, fontSize: 48, lineHeight: 54 },
  heading: { fontFamily: MANROPE.extraBold, fontSize: 30, lineHeight: 36 },
  section: { fontFamily: MANROPE.bold, fontSize: 24, lineHeight: 30 },
  subheading: { fontFamily: MANROPE.bold, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: MANROPE.regular, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: MANROPE.bold, fontSize: 15, lineHeight: 20 },
  small: { fontFamily: MANROPE.medium, fontSize: 12, lineHeight: 18 },
} as const satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof typography;
