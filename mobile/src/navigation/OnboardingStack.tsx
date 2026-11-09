import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme';
import { OnboardingStackParams } from './types';
import { OrgVerificationScreen } from '../screens/onboarding/OrgVerificationScreen';
import { ApplicationStatusScreen } from '../screens/onboarding/ApplicationStatusScreen';
import { useAuth } from '../auth/AuthContext';

const Stack = createNativeStackNavigator<OnboardingStackParams>();

/**
 * Shown to email-verified users who are not yet approved.
 * If they haven't submitted org details, show OrgVerification first; otherwise Status.
 */
export function OnboardingStack() {
  const { user } = useAuth();
  const needsOrg = !user?.orgId && user?.status === 'PENDING_APPROVAL';
  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
    >
      {needsOrg ? (
        <Stack.Screen name="OrgVerification" component={OrgVerificationScreen} />
      ) : (
        <Stack.Screen name="ApplicationStatus" component={ApplicationStatusScreen} />
      )}
    </Stack.Navigator>
  );
}
