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

type Props = NativeStackScreenProps<AuthStackParams, 'ForgotPassword'>;

export function ForgotPasswordScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!email.trim()) {
      setError(t('common.required'));
      return;
    }
    setLoading(true);
    try {
      await authApi.forgotPassword(email.trim().toLowerCase());
      setRequested(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  if (requested) {
    return (
      <Screen scroll>
        <View style={styles.header}>
          <Text variant="title">{t('forgot.requestedTitle')}</Text>
          <Text variant="body" color={colors.textMuted} style={styles.sub}>
            {t('forgot.requestedBody')}
          </Text>
        </View>
        <Button
          title={t('forgot.haveCode')}
          variant="accent"
          onPress={() => navigation.navigate('ResetPassword', { email: email.trim().toLowerCase() })}
        />
        <Button title={t('common.back')} variant="ghost" onPress={() => navigation.navigate('Login')} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Text variant="title">{t('forgot.title')}</Text>
        <Text variant="body" color={colors.textMuted} style={styles.sub}>
          {t('forgot.subtitle')}
        </Text>
      </View>
      <TextField label={t('common.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" />
      {!!error && (
        <Text variant="body" color={colors.danger} style={styles.err}>
          {error}
        </Text>
      )}
      <Button title={t('forgot.cta')} variant="accent" onPress={onSubmit} loading={loading} />
      <Button title={t('common.back')} variant="ghost" onPress={() => navigation.goBack()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: spacing.lg, marginBottom: spacing.xl },
  sub: { marginTop: spacing.sm },
  err: { marginBottom: spacing.md },
});
