import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography } from '../theme';
import { AppTabsParams } from './types';
import { HomeScreen } from '../screens/tabs/HomeScreen';
import { ProfileScreen } from '../screens/tabs/ProfileScreen';
import { CalendarScreen } from '../screens/tabs/CalendarScreen';
import { NotificationsScreen } from '../screens/tabs/NotificationsScreen';
import { MeetingsStack } from './MeetingsStack';
import { AdminStack } from './AdminStack';
import { useAuth } from '../auth/AuthContext';
import { t } from '../i18n';

const Tab = createBottomTabNavigator<AppTabsParams>();

const icons: Record<keyof AppTabsParams, keyof typeof Ionicons.glyphMap> = {
  Home: 'home',
  Meetings: 'videocam',
  Calendar: 'calendar',
  Notifications: 'notifications',
  Admin: 'shield',
  Profile: 'person',
};

const ADMIN_ROLES = ['SUPER_ADMIN', 'INSTITUTE_ADMIN'];

export function AppTabs() {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user?.role ?? '');
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent, // saffron active indicator
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 58 + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontFamily: typography.fontFamily.medium, fontSize: 11 },
        tabBarIcon: ({ color, size, focused }) => {
          const base = String(icons[route.name]);
          const name = (focused ? base : `${base}-outline`) as keyof typeof Ionicons.glyphMap;
          return <Ionicons name={name} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: t('tabs.home') }} />
      <Tab.Screen name="Meetings" component={MeetingsStack} options={{ tabBarLabel: t('tabs.meetings') }} />
      <Tab.Screen name="Calendar" component={CalendarScreen} options={{ tabBarLabel: t('tabs.calendar') }} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} options={{ tabBarLabel: t('tabs.notifications') }} />
      {isAdmin && (
        <Tab.Screen name="Admin" component={AdminStack} options={{ tabBarLabel: 'Admin' }} />
      )}
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: t('tabs.profile') }} />
    </Tab.Navigator>
  );
}
