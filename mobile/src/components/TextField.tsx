import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';
import { Text } from './Text';

interface Props extends TextInputProps {
  label: string;
  error?: string | null;
  secure?: boolean;
}

/** Labeled input with error state and strong contrast. Body text >= 16px. */
export function TextField({ label, error, secure, style, ...rest }: Props) {
  const [hidden, setHidden] = useState(!!secure);
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text variant="label" color={colors.textMuted} style={styles.label}>
        {label}
      </Text>
      <View
        style={[
          styles.inputRow,
          focused && styles.focused,
          !!error && styles.errored,
        ]}
      >
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={colors.textSubtle}
          secureTextEntry={hidden}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoCapitalize="none"
          {...rest}
        />
        {secure && (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10} style={styles.reveal}>
            <Text variant="label" color={colors.primary}>
              {hidden ? 'Show' : 'Hide'}
            </Text>
          </Pressable>
        )}
      </View>
      {!!error && (
        <Text variant="caption" color={colors.danger} style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  label: { marginBottom: spacing.xs },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  focused: { borderColor: colors.primaryLight },
  errored: { borderColor: colors.danger },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: typography.size.body,
    fontFamily: typography.fontFamily.regular,
    color: colors.text,
  },
  reveal: { paddingLeft: spacing.sm },
  error: { marginTop: spacing.xs },
});
