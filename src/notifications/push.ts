import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

export interface PushRegistration {
  token: string;
  provider: 'expo';
}

/**
 * Requests notification permission and returns an Expo push token, or null
 * if permission was denied or a token could not be obtained (e.g. no EAS
 * project configured yet — that's fine during development).
 */
export async function registerForPushNotificationsAsync(): Promise<PushRegistration | null> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('price-alerts', {
      name: 'Price alerts',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') return null;

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return { token: data, provider: 'expo' };
  } catch {
    return null;
  }
}
