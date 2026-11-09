import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';
import { Wordmark } from '../components/Wordmark';
import { BrandPattern } from '../components/BrandPattern';
import { Text } from '../components/Text';
import { t } from '../i18n';

/** Shown during session restore. Navy background, wordmark, thin saffron progress line. */
export function SplashScreen() {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: false }),
      ]),
    ).start();
  }, [progress]);

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['5%', '85%'] });

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.center}>
        <BrandPattern onDark />
        <View style={styles.gap} />
        <Wordmark size="lg" onDark showTagline />
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressBar, { width }]} />
        </View>
      </View>
      <Text variant="caption" color="rgba(255,255,255,0.7)" center style={styles.footer}>
        {t('app.initiative')}
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primary, justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  gap: { height: spacing.xl },
  progressTrack: {
    marginTop: spacing.xxl,
    height: 3,
    width: '70%',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: { height: 3, backgroundColor: colors.accent, borderRadius: 2 },
  footer: { paddingBottom: spacing.xl },
});
