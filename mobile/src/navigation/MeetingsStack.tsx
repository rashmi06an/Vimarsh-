import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors, typography } from '../theme';
import { MeetingsStackParams } from './types';
import { MeetingsListScreen } from '../screens/meetings/MeetingsListScreen';
import { MeetingDetailsScreen } from '../screens/meetings/MeetingDetailsScreen';
import { ScheduleMeetingScreen } from '../screens/meetings/ScheduleMeetingScreen';
import { InviteParticipantsScreen } from '../screens/meetings/InviteParticipantsScreen';
import { MeetingRoomScreen } from '../screens/room/MeetingRoomScreen';

const Stack = createNativeStackNavigator<MeetingsStackParams>();

export function MeetingsStack() {
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
      <Stack.Screen name="MeetingsList" component={MeetingsListScreen} options={{ headerShown: false }} />
      <Stack.Screen name="MeetingDetails" component={MeetingDetailsScreen} options={{ title: 'Meeting' }} />
      <Stack.Screen name="ScheduleMeeting" component={ScheduleMeetingScreen} options={{ title: 'Schedule' }} />
      <Stack.Screen name="InviteParticipants" component={InviteParticipantsScreen} options={{ title: 'Invite' }} />
      <Stack.Screen name="MeetingRoom" component={MeetingRoomScreen} options={{ headerShown: false, presentation: 'fullScreenModal' }} />
    </Stack.Navigator>
  );
}
