import { useState, type Ref } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AppText } from './AppText';
import { FieldMessage, useAnnouncement } from './FieldMessage';
import { colors, radii, spacing } from './tokens';

type OtpFieldProps = {
  /** Spoken name of the field, such as "Verification code". */
  label: string;
  /** Digits entered so far; never longer than `length`. */
  value: string;
  /** Receives digits only, cut to `length`. */
  onChangeText: (code: string) => void;
  /** Number of digits. Defaults to 6. */
  length?: number;
  /** Shown below the cells, read with the field, and announced when it appears or changes. */
  error?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  ref?: Ref<TextInput>;
};

/**
 * One-time code input: a single text field drawn as separate digit cells.
 *
 * One transparent `TextInput` covers the cells, so paste, one-time-code autofill, the
 * number keyboard, and screen readers all deal with one field, never six. The cells only
 * show the digits and are hidden from screen readers. Pasted or autofilled text keeps only
 * its digits, so "Code: 123 456" becomes "123456". `maxLength` is not set, because it would
 * cut such text before the digits are extracted.
 */
export function OtpField({
  label,
  value,
  onChangeText,
  length = 6,
  error,
  disabled = false,
  autoFocus,
  ref,
}: OtpFieldProps) {
  const [focused, setFocused] = useState(false);
  useAnnouncement(error);
  const active = Math.min(value.length, length - 1);

  return (
    <View style={styles.field}>
      <View>
        <View style={styles.cells} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {Array.from({ length }, (_, index) => (
            <View
              key={index}
              style={[
                styles.cell,
                focused && index === active && styles.activeCell,
                Boolean(error) && styles.invalidCell,
                disabled && styles.disabledCell,
              ]}
            >
              <AppText variant="section">{value[index] ?? ''}</AppText>
            </View>
          ))}
        </View>
        <TextInput
          ref={ref}
          value={value}
          onChangeText={(text) => onChangeText(text.replace(/\D/g, '').slice(0, length))}
          accessibilityLabel={label}
          accessibilityHint={error || undefined}
          editable={!disabled}
          autoFocus={autoFocus}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          caretHidden
          selectionColor="transparent"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={styles.input}
        />
      </View>
      <FieldMessage error={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.sm,
  },
  cells: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cell: {
    flex: 1,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.sm,
    backgroundColor: colors.white,
  },
  activeCell: {
    borderColor: colors.teal,
  },
  invalidCell: {
    borderColor: colors.danger,
  },
  disabledCell: {
    backgroundColor: colors.soft,
  },
  input: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    color: 'transparent',
    backgroundColor: 'transparent',
  },
});
