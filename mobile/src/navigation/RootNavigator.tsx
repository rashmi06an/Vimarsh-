import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { colors } from '../theme';
import { useAuth } from '../auth/AuthContext';
import { SplashScreen } from '../screens/SplashScreen';
import { AuthStack } from './AuthStack';
import { OnboardingStack } from './OnboardingStack';
import { AppTabs } from './AppTabs';

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.background, primary: colors.primary },
};

/**
 * Navigation guard: the whole tree is chosen by auth state, so there is no way to reach a
 * protected screen without the right status.
 *   bootstrapping           -> Splash
 *   no user                 -> Auth stack
 *   verified, not approved  -> Onboarding (org verification / status)
 *   approved                -> App tabs
 */
export function RootNavigator() {
  const { bootstrapping, user } = useAuth();

  let tree: React.ReactNode;
  if (bootstrapping) {
    tree = <SplashScreen />;
  } else if (!user) {
    tree = <AuthStack />;
  } else if (user.status === 'APPROVED') {
    tree = <AppTabs />;
  } else {
    // PENDING_APPROVAL or REJECTED (PENDING_OTP/SUSPENDED can't obtain a session).
    tree = <OnboardingStack />;
  }

  return <NavigationContainer theme={navTheme}>{tree}</NavigationContainer>;
}
