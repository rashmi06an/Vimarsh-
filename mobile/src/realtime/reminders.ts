import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Show reminders even when the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let permissionAsked = false;

export async function ensureNotifPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (permissionAsked && !current.canAskAgain) return false;
    permissionAsked = true;
    const req = await Notifications.requestPermissionsAsync();
    return req.granted;
  } catch {
    return false;
  }
}

export interface ReminderMeeting {
  id: string;
  title: string;
  startAt: string;
}

/**
 * Schedule a local notification 1 minute before each upcoming meeting. Reschedules the whole
 * set each call (cancel-all first) so it stays in sync with the latest meeting list. Entirely
 * best-effort — any failure is swallowed so it never blocks the UI.
 */
export async function scheduleMeetingReminders(meetings: ReminderMeeting[]): Promise<void> {
  try {
    if (!(await ensureNotifPermission())) return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('meetings', {
        name: 'Meeting reminders',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    await Notifications.cancelAllScheduledNotificationsAsync();
    const now = Date.now();
    for (const m of meetings) {
      const fireAt = new Date(m.startAt).getTime() - 60_000; // 1 min before
      if (fireAt <= now) continue;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Meeting starting in 1 minute',
          body: m.title,
          data: { meetingId: m.id },
        },
        // Cast: the DATE trigger shape differs slightly across expo-notifications versions.
        trigger: { type: 'date', date: new Date(fireAt), channelId: 'meetings' } as unknown as Notifications.NotificationTriggerInput,
      });
    }
  } catch {
    // non-fatal
  }
}
