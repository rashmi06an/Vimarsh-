import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors, typography } from '../theme';
import { AdminStackParams } from './types';
import { AdminHomeScreen } from '../screens/admin/AdminHomeScreen';
import { ApprovalsScreen } from '../screens/admin/ApprovalsScreen';
import { InvitesScreen } from '../screens/admin/InvitesScreen';
import { PasswordResetsScreen } from '../screens/admin/PasswordResetsScreen';
import { AuditLogScreen } from '../screens/admin/AuditLogScreen';

const Stack = createNativeStackNavigator<AdminStackParams>();

export function AdminStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.primary,
        headerTitleStyle: { fontFamily: typography.fontFamily.semibold },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="AdminHome" component={AdminHomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Approvals" component={ApprovalsScreen} options={{ title: 'Approvals' }} />
      <Stack.Screen name="Invites" component={InvitesScreen} options={{ title: 'Member invitations' }} />
      <Stack.Screen name="PasswordResets" component={PasswordResetsScreen} options={{ title: 'Password resets' }} />
      <Stack.Screen name="AuditLog" component={AuditLogScreen} options={{ title: 'Audit log' }} />
    </Stack.Navigator>
  );
}
