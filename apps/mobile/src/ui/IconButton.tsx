import type { ReactNode, Ref } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { colors, radii } from './tokens';

const SIZE = 48;

type IconButtonProps = {
  /**
   * The icon to draw, about 22 points. It is decorative and hidden from screen readers,
   * which announce `accessibilityLabel` instead.
   */
  icon: ReactNode;
  /** Required spoken name, because the button shows no text, for example "Back". */
  accessibilityLabel: string;
  onPress: () => void;
  /** Background: `soft` on white screens, `white` on tinted or map surfaces. Defaults to `soft`. */
  tone?: 'soft' | 'white';
  /** Prevents presses and dims the button; reported to screen readers. */
  disabled?: boolean;
  /** Shows a spinner instead of the icon and ignores presses, like `Button`'s `busy`. */
  busy?: boolean;
  /** For returning screen-reader focus here, for example after a sheet this button opened closes. */
  ref?: Ref<View>;
};

/**
 * Square icon-only button with a 48-point touch target.
 *
 * It does not choose an icon set: callers pass the drawn icon. That keeps the vector icon
 * dependency decision with the first feature that needs real icons.
 */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  tone = 'soft',
  disabled = false,
  busy = false,
  ref,
}: IconButtonProps) {
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors[tone] },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={colors.ink} />
      ) : (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {icon}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.4,
  },
});
