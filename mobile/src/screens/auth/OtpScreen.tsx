import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { Button } from '../../components/Button';
import { colors, radius, spacing, typography } from '../../theme';
import { t } from '../../i18n';
import { authApi } from '../../api/endpoints';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { AuthStackParams } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParams, 'Otp'>;
const CELLS = 6;

export function OtpScreen({ route }: Props) {
  const { email } = route.params;
  const { adoptSession } = useAuth();
  const inputRef = useRef<TextInput>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const verify = async (value: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await authApi.verifyOtp({ email, code: value });
      // Session returned; adopt it. RootNavigator will route to onboarding by status.
      await adoptSession({ accessToken: res.accessToken, refreshToken: res.refreshToken, expiresIn: res.expiresIn }, res.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('errors.generic'));
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const onChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, CELLS);
    setCode(digits);
    if (digits.length === CELLS) verify(digits);
  };

  const resend = async () => {
    setError(null);
    try {
      await authApi.resendOtp(email);
      setCooldown(60);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('errors.generic'));
    }
  };

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Text variant="title">{t('otp.title')}</Text>
        <Text variant="body" color={colors.textMuted} style={styles.sub}>
          {t('otp.subtitle', { email })}
        </Text>
      </View>

      <View style={styles.cells}>
        {Array.from({ length: CELLS }).map((_, i) => (
          <View key={i} style={[styles.cell, i === code.length && styles.cellActive]}>
            <Text variant="title">{code[i] ?? ''}</Text>
          </View>
        ))}
      </View>

      {/* Hidden single input drives the cells. */}
      <TextInput
        ref={inputRef}
        value={code}
        onChangeText={onChange}
        keyboardType="number-pad"
        maxLength={CELLS}
        style={styles.hiddenInput}
        autoFocus
      />

      {!!error && (
        <Text variant="body" color={colors.danger} center style={styles.err}>
          {error}
        </Text>
      )}

      <Button title={t('otp.cta')} variant="accent" onPress={() => verify(code)} loading={loading} disabled={code.length !== CELLS} />

      <Button
        title={cooldown > 0 ? t('otp.resentIn', { s: cooldown }) : t('otp.resend')}
        variant="ghost"
        onPress={resend}
        disabled={cooldown > 0}
      />

      <Text variant="caption" color={colors.textSubtle} center style={styles.devNote}>
        {t('otp.devNote')}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: spacing.lg, marginBottom: spacing.xl },
  sub: { marginTop: spacing.sm },
  cells: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xl },
  cell: {
    width: 48,
    height: 58,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellActive: { borderColor: colors.accent, borderWidth: 2 },
  hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  err: { marginBottom: spacing.md },
  devNote: { marginTop: spacing.lg, fontStyle: 'italic' },
});
