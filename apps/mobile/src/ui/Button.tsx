import { Pressable, StyleSheet, Text } from 'react-native';

type ButtonProps = {
  /** Visible text. Screen readers also use it as the button's name unless `accessibilityLabel` is set. */
  label: string;
  onPress: () => void;
  /**
   * Prevents presses and dims the button. React Native's `Pressable` also reports the
   * disabled state to screen readers, so assistive technology announces it as unavailable.
   */
  disabled?: boolean;
  /**
   * Spoken name that replaces `label` for screen readers. Set it only when the visible text
   * lacks context on its own, for example "Close sign-in" for a button labeled "Close".
   */
  accessibilityLabel?: string;
};

/** Text button with a single press action and a touch target at least 48 points tall. */
export function Button({ label, onPress, disabled = false, accessibilityLabel }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#111111',
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
