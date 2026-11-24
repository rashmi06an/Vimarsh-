import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Platform } from 'react-native';
import { Screen } from '../../components/Screen';
import { Wordmark } from '../../components/Wordmark';
import { Text } from '../../components/Text';
import { TextField } from '../../components/TextField';
import { Button } from '../../components/Button';
import { colors, spacing } from '../../theme';
import { t } from '../../i18n';
import { ApiError } from '../../api/client';
import { BUILD_TAG } from '../../config/env';
import { useAuth } from '../../auth/AuthContext';
import type { AuthStackParams } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParams, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError(t('common.required'));
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      // RootNavigator switches based on the resulting user/status.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll>
      <View style={styles.brand}>
        <Wordmark size="md" />
      </View>
      <View style={styles.header}>
        <Text variant="title">{t('login.title')}</Text>
        <Text variant="body" color={colors.textMuted} style={styles.sub}>
          {t('login.subtitle')}
        </Text>
      </View>

      <TextField label={t('common.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" />
      <TextField label={t('common.password')} value={password} onChangeText={setPassword} secure />

      {!!error && (
        <Text variant="body" color={colors.danger} style={styles.err}>
          {error}
        </Text>
      )}

      <Button title={t('login.cta')} variant="accent" onPress={onSubmit} loading={loading} />
      <Button title={t('login.forgot')} variant="ghost" onPress={() => navigation.navigate('ForgotPassword')} />
      <View style={styles.divider} />
      <Button title={t('login.noAccount')} variant="outline" onPress={() => navigation.navigate('Register')} />
      <Text variant="caption" color={colors.textSubtle} center style={styles.build}>{BUILD_TAG}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', marginTop: Platform.OS === 'ios' ? spacing.lg : spacing.xl, marginBottom: spacing.lg },
  header: { marginBottom: spacing.xl },
  sub: { marginTop: spacing.sm },
  err: { marginBottom: spacing.md },
  divider: { height: spacing.lg },
  build: { marginTop: spacing.xl },
});
