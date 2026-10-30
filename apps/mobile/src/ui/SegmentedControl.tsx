import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { colors, radii, spacing } from './tokens';

type SegmentedControlProps<T extends string> = {
  /** Spoken name of the group, such as "Departure time". */
  label: string;
  options: readonly { value: T; label: string }[];
  /** Selected value, or `null` before the user chooses. */
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
};

/**
 * Single choice among a few short options, shown side by side, such as the departure
 * choice (Now, in 5 or in 10 minutes).
 *
 * Screen readers get a radio group: each option is a radio button with its checked state.
 * Options share the row equally and grow taller instead of clipping larger text. The
 * component holds no domain values; the feature supplies the options.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: SegmentedControlProps<T>) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.group}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.option,
              selected ? styles.selected : styles.unselected,
              pressed && styles.pressed,
              disabled && styles.disabled,
            ]}
          >
            <AppText variant="label" color={selected ? 'white' : 'ink'} style={styles.label}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  option: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
  },
  selected: {
    backgroundColor: colors.ink,
  },
  unselected: {
    backgroundColor: colors.soft,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    textAlign: 'center',
  },
});
