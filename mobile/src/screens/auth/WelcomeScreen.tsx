import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing } from '../../theme';
import { Wordmark } from '../../components/Wordmark';
import { BrandPattern } from '../../components/BrandPattern';
import { Button } from '../../components/Button';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import type { AuthStackParams } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParams, 'Welcome'>;

export function WelcomeScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.top}>
        <BrandPattern onDark />
        <View style={styles.gap} />
        <Wordmark size="lg" onDark showTagline />
      </View>

      <View style={styles.card}>
        <Text variant="body" color={colors.textMuted} center style={styles.subtitle}>
          {t('welcome.subtitle')}
        </Text>
        <Button title={t('welcome.signIn')} variant="accent" onPress={() => navigation.navigate('Login')} />
        <View style={styles.gapSm} />
        <Button title={t('welcome.register')} variant="outline" onPress={() => navigation.navigate('Register')} />
        <View style={styles.gapSm} />
        <Button title={t('welcome.joinViaInvitation')} variant="ghost" onPress={() => navigation.navigate('Login')} />
      </View>

      <Text variant="caption" color="rgba(255,255,255,0.7)" center style={styles.footer}>
        {t('app.initiative')}
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primary },
  top: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  gap: { height: spacing.xl },
  gapSm: { height: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.xl,
  },
  subtitle: { marginBottom: spacing.lg },
  footer: { paddingVertical: spacing.md, backgroundColor: colors.surface },
});
