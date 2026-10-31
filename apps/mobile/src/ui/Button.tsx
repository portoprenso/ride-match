import type { Ref } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, type View } from 'react-native';

import { AppText } from './AppText';
import { colors, radii, spacing, type ColorName } from './tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

type Look = { background?: ColorName; text: ColorName };

const VARIANTS: Record<ButtonVariant, Look> = {
  primary: { background: 'ink', text: 'white' },
  secondary: { background: 'soft', text: 'ink' },
  ghost: { text: 'ink' },
  danger: { background: 'danger', text: 'white' },
};

type ButtonProps = {
  /** Visible text. Screen readers also use it as the button's name unless `accessibilityLabel` is set. */
  label: string;
  onPress: () => void;
  /** Visual emphasis: one `primary` action per screen, `danger` for destructive ones. Defaults to `primary`. */
  variant?: ButtonVariant;
  /**
   * Prevents presses and shows the unavailable style. React Native's `Pressable` also
   * reports the disabled state to screen readers, so assistive technology announces it.
   */
  disabled?: boolean;
  /**
   * Marks the action as running: shows a spinner, ignores further presses, and reports
   * busy and disabled to screen readers. Set it as soon as the work starts, so a second
   * press cannot submit the same action again.
   */
  busy?: boolean;
  /**
   * Spoken name that replaces `label` for screen readers. Set it only when the visible text
   * lacks context on its own, for example "Close sign-in" for a button labeled "Close".
   */
  accessibilityLabel?: string;
  /** For returning screen-reader focus here, for example after a sheet this button opened closes. */
  ref?: Ref<View>;
};

/**
 * Text button with a single press action, at least 52 points tall (above the 48-point
 * minimum touch target). The label wraps and the button grows with larger text.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  accessibilityLabel,
  ref,
}: ButtonProps) {
  const look: Look = disabled
    ? { background: variant === 'ghost' ? undefined : 'line', text: 'muted' }
    : VARIANTS[variant];

  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      // Always explicit: when Android derives the name from the children, it kept "busy" as
      // the button's name after the busy state ended (seen on Android 16).
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        look.background && { backgroundColor: colors[look.background] },
        pressed && styles.pressed,
      ]}
    >
      {busy && <ActivityIndicator color={colors[look.text]} />}
      <AppText variant="label" color={look.text} style={styles.label}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
  },
  pressed: {
    opacity: 0.8,
  },
  label: {
    flexShrink: 1,
    textAlign: 'center',
  },
});
