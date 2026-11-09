import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { TextField } from '../../components/TextField';
import { Button } from '../../components/Button';
import { colors, spacing } from '../../theme';
import { t } from '../../i18n';
import { authApi } from '../../api/endpoints';
import { ApiError } from '../../api/client';
import type { AuthStackParams } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParams, 'Register'>;

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const passwordOk = (p: string) => /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(p);

export function RegisterScreen({ navigation }: Props) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!fullName.trim()) e.fullName = t('common.required');
    if (!emailOk(email)) e.email = 'Enter a valid email';
    if (!passwordOk(password)) e.password = t('register.passwordHint');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = async () => {
    setSubmitErr(null);
    if (!validate()) return;
    setLoading(true);
    try {
      await authApi.register({
        email: email.trim().toLowerCase(),
        fullName: fullName.trim(),
        password,
        phone: phone.trim() || undefined,
      });
      navigation.navigate('Otp', { email: email.trim().toLowerCase() });
    } catch (err) {
      setSubmitErr(err instanceof ApiError ? err.message : t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Text variant="title">{t('register.title')}</Text>
        <Text variant="body" color={colors.textMuted} style={styles.sub}>
          {t('register.subtitle')}
        </Text>
      </View>

      <TextField label={t('common.fullName')} value={fullName} onChangeText={setFullName} error={errors.fullName} autoCapitalize="words" />
      <TextField label={t('common.email')} value={email} onChangeText={setEmail} error={errors.email} keyboardType="email-address" autoComplete="email" />
      <TextField label={t('common.password')} value={password} onChangeText={setPassword} error={errors.password} secure />
      <TextField label={t('common.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

      {!!submitErr && (
        <Text variant="body" color={colors.danger} style={styles.err}>
          {submitErr}
        </Text>
      )}

      <Button title={t('register.cta')} variant="accent" onPress={onSubmit} loading={loading} />
      <Button title={t('register.haveAccount')} variant="ghost" onPress={() => navigation.navigate('Login')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: spacing.lg, marginBottom: spacing.xl },
  sub: { marginTop: spacing.sm },
  err: { marginBottom: spacing.md },
});
