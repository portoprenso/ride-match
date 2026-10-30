import { useState, type Ref } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { AppText } from './AppText';
import { FieldMessage, useAnnouncement } from './FieldMessage';
import { colors, radii, spacing, typography } from './tokens';

export type TextFieldProps = Omit<
  TextInputProps,
  'style' | 'editable' | 'accessibilityLabel' | 'accessibilityHint' | 'maxLength' | 'value' | 'onChangeText'
> & {
  /** Visible label above the field; it is also the field's spoken name. */
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  /** Short guidance below the field. An error replaces it while shown. */
  hint?: string;
  /**
   * Validation or submission error. It is shown below the field with an error border,
   * read with the field, and announced when it appears or changes.
   */
  error?: string;
  /** Character limit. A "used/max" counter shows how much bounded text remains. */
  maxLength?: number;
  /** Prevents editing and shows the field as unavailable. */
  disabled?: boolean;
  /** Shows a Clear action while the field has text, for example in search. */
  onClear?: () => void;
  ref?: Ref<TextInput>;
};

/**
 * Labeled single- or multi-line text input in the app's field style.
 *
 * The field grows with its text and with larger font sizes. Its border shows focus (teal)
 * and errors (danger). Other `TextInput` props, such as `keyboardType`, `autoComplete`, or
 * `onSubmitEditing`, pass through unchanged.
 */
export function TextField({
  label,
  value,
  onChangeText,
  hint,
  error,
  maxLength,
  disabled = false,
  onClear,
  multiline,
  onFocus,
  onBlur,
  ref,
  ...inputProps
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  useAnnouncement(error);

  return (
    <View style={styles.field}>
      <AppText variant="small" color="muted" accessibilityElementsHidden importantForAccessibility="no">
        {label}
      </AppText>
      <View
        style={[
          styles.box,
          focused && styles.focused,
          Boolean(error) && styles.invalid,
          disabled && styles.disabled,
        ]}
      >
        <TextInput
          {...inputProps}
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          accessibilityLabel={label}
          accessibilityHint={error || hint}
          editable={!disabled}
          maxLength={maxLength}
          multiline={multiline}
          placeholderTextColor={colors.muted}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[styles.input, multiline && styles.multiline]}
        />
        {onClear && value.length > 0 && !disabled && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label}`}
            onPress={onClear}
            hitSlop={spacing.md}
            style={styles.clear}
          >
            <AppText variant="label" color="teal">
              Clear
            </AppText>
          </Pressable>
        )}
      </View>
      <FieldMessage
        hint={hint}
        error={error}
        count={maxLength === undefined ? undefined : { used: value.length, max: maxLength }}
      />
    </View>
  );
}

/** Search variant of `TextField`: search keyboard action, no autocorrection, and a Clear action. */
export function SearchField(props: Omit<TextFieldProps, 'onClear'> & { onClear: () => void }) {
  return (
    <TextField
      returnKeyType="search"
      autoCorrect={false}
      autoCapitalize="none"
      accessibilityRole="search"
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.sm,
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.white,
  },
  focused: {
    borderColor: colors.teal,
  },
  invalid: {
    borderColor: colors.danger,
  },
  disabled: {
    backgroundColor: colors.soft,
  },
  input: {
    ...typography.body,
    flex: 1,
    minHeight: typography.body.lineHeight,
    padding: 0,
    color: colors.ink,
  },
  multiline: {
    minHeight: typography.body.lineHeight * 4,
    textAlignVertical: 'top',
  },
  clear: {
    paddingVertical: spacing.xs,
  },
});
