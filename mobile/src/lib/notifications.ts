/**
 * Two kinds of notifications, on purpose:
 *
 * 1. LOCAL reminders (check-in open, leave for the airport, boarding soon).
 *    Flight times are known in advance, so the phone schedules these itself. No server, no
 *    APNs/FCM keys, no push tokens. They work in Expo Go, offline, and survive the backend
 *    being down. They're rescheduled every time the flight list loads, so a schedule change
 *    automatically moves the reminders.
 *
 * 2. REMOTE push (new booking found, schedule change, cancellation).
 *    Only for things the phone can't predict. Sent by the backend through Expo's push service.
 *    Needs a real phone + an EAS project ID, and on Android a development build. Every reason it
 *    can't work is reported in plain words on the Settings screen instead of failing silently.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api, type Flight } from './api';
import { storage } from './storage';
import { clockAt, wallTime } from './time';

export const supported = Platform.OS !== 'web';
const PREFIX = 'flight-';
const MAX_SCHEDULED = 50; // iOS keeps at most 64 pending local notifications per app
const PUSH_TOKEN_KEY = 'expo_push_token';

export async function setupNotifications() {
  if (!supported) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    // Android 8+ won't show anything without a channel. 'default' is where Expo push lands.
    // Expo Go on Android can reject this (no channel provider); reminders still show on the
    // default channel there, so a failure here must never break app startup.
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Flight updates',
        importance: Notifications.AndroidImportance.HIGH,
      });
      await Notifications.setNotificationChannelAsync('reminders', {
        name: 'Flight reminders',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    } catch (e) {
      console.warn('Could not create notification channels:', (e as Error).message);
    }
  }
}

export type Permission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export async function getPermission(): Promise<Permission> {
  if (!supported) return 'unsupported';
  const p = await Notifications.getPermissionsAsync();
  if (p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'granted';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

export async function requestPermission(): Promise<Permission> {
  if (!supported) return 'unsupported';
  const p = await Notifications.requestPermissionsAsync();
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

// ---------- local reminders ----------

export type Reminder = { id: string; at: Date; title: string; body: string; flightId: number };

export function remindersFor(f: Flight): Reminder[] {
  if (!f.departure.utc || f.status.code === 'cancelled') return [];
  const dep = Date.parse(f.departure.utc);
  const boarding = Date.parse(f.boarding_utc);
  const depTime = wallTime(f.departure.local_time);
  const terminal = f.departure.terminal ? `, Terminal ${f.departure.terminal}` : '';
  const route = `${f.departure.city} → ${f.arrival.city}`;
  return [
    {
      id: `${PREFIX}${f.id}-checkin`,
      at: new Date(dep - 24 * 3600_000),
      title: `Check-in is open · ${f.flight_number}`,
      body: `${route} departs tomorrow at ${depTime}.`,
    },
    {
      id: `${PREFIX}${f.id}-leave`,
      at: new Date(dep - 3 * 3600_000),
      title: 'Time to head to the airport',
      body: `${f.flight_number} leaves ${f.departure.airport}${terminal} at ${depTime}.`,
    },
    {
      id: `${PREFIX}${f.id}-boarding`,
      at: new Date(boarding - 15 * 60_000),
      title: `Boarding in 15 minutes · ${f.flight_number}`,
      body: `To ${f.arrival.city}. Estimated boarding ${clockAt(f.boarding_utc, f.departure.local_time)}.`,
    },
  ].map((r) => ({ ...r, flightId: f.id }));
}

/** Replace all flight reminders with ones matching the current flight list. Idempotent. */
export async function syncReminders(flights: Flight[]): Promise<number> {
  if (!supported || (await getPermission()) !== 'granted') return 0;

  const existing = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    existing
      .filter((n) => n.identifier.startsWith(PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );

  const soon = Date.now() + 5_000;
  const upcoming = flights
    .flatMap(remindersFor)
    .filter((r) => r.at.getTime() > soon)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, MAX_SCHEDULED);

  for (const r of upcoming) {
    await Notifications.scheduleNotificationAsync({
      identifier: r.id,
      content: { title: r.title, body: r.body, sound: 'default', data: { url: `/flight/${r.flightId}` } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at, channelId: 'reminders' },
    });
  }
  return upcoming.length;
}

export async function scheduledReminderCount(): Promise<number> {
  if (!supported) return 0;
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all.filter((n) => n.identifier.startsWith(PREFIX)).length;
}

export async function sendTestReminder(seconds = 5) {
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Test reminder ✈️', body: 'Local reminders work on this phone.', data: { url: '/settings' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, channelId: 'reminders' },
  });
}

// ---------- remote push ----------

export type PushStatus = { ok: true; token: string } | { ok: false; reason: string };

export async function registerForRemotePush(): Promise<PushStatus> {
  if (!supported) return { ok: false, reason: 'Push needs the iOS or Android app, not the web preview.' };
  if (!Device.isDevice) return { ok: false, reason: 'Simulators can’t receive remote push. Use a real phone.' };
  if (Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return {
      ok: false,
      reason: 'Expo Go on Android can’t receive remote push. Make a development build (README → Push). Local reminders still work.',
    };
  }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    return { ok: false, reason: 'No EAS project ID. Run `npx eas-cli init` in mobile/ once (free Expo account).' };
  }
  if ((await getPermission()) !== 'granted') {
    return { ok: false, reason: 'Notifications are turned off for this app.' };
  }
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api('/push/register', { method: 'POST', body: { token, platform: Platform.OS } });
    await storage.set(PUSH_TOKEN_KEY, token);
    return { ok: true, token };
  } catch (e) {
    return { ok: false, reason: `Couldn’t get a push token: ${(e as Error).message}` };
  }
}

export function storedPushToken() {
  return storage.get(PUSH_TOKEN_KEY);
}
