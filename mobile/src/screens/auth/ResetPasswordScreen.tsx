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

type Props = NativeStackScreenProps<AuthStackParams, 'ResetPassword'>;
const passwordOk = (p: string) => /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(p);

export function ResetPasswordScreen({ route, navigation }: Props) {
  const { email } = route.params;
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (code.length !== 6) return setError('Enter the 6-digit code');
    if (!passwordOk(newPassword)) return setError(t('register.passwordHint'));
    setLoading(true);
    try {
      await authApi.resetPassword({ email, code, newPassword });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <Screen>
        <View style={styles.doneWrap}>
          <Text variant="title" center>
            {t('forgot.done')}
          </Text>
          <View style={styles.gap} />
          <Button title={t('login.cta')} variant="accent" onPress={() => navigation.navigate('Login')} fullWidth={false} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Text variant="title">{t('forgot.title')}</Text>
        <Text variant="body" color={colors.textMuted} style={styles.sub}>
          {t('otp.subtitle', { email })}
        </Text>
      </View>
      <TextField label={t('forgot.codeLabel')} value={code} onChangeText={(x) => setCode(x.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" />
      <TextField label={t('forgot.newPassword')} value={newPassword} onChangeText={setNewPassword} secure />
      {!!error && (
        <Text variant="body" color={colors.danger} style={styles.err}>
          {error}
        </Text>
      )}
      <Button title={t('forgot.resetCta')} variant="accent" onPress={onSubmit} loading={loading} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: spacing.lg, marginBottom: spacing.xl },
  sub: { marginTop: spacing.sm },
  err: { marginBottom: spacing.md },
  doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  gap: { height: spacing.xl },
});
