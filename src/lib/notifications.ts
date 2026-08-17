import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

/**
 * 前台收到通知时的展示策略（in-app 横幅）。
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Android 通知渠道：新消息 */
const MESSAGE_CHANNEL_ID = 'messages';

/**
 * 请求通知权限（iOS/Android 运行时弹窗），返回是否已授权。
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch (err) {
    console.error('Notification permission error:', err);
    return false;
  }
}

/**
 * 注册当前设备并返回 Expo Push Token（用于非 in-app 远程推送）。
 * Android 需要先创建通知渠道。
 */
export async function getExpoPushToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(MESSAGE_CHANNEL_ID, {
        name: 'New Messages',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
      });
    }
    const token = await Notifications.getExpoPushTokenAsync();
    return token.data;
  } catch (err) {
    console.error('Failed to get Expo push token:', err);
    return null;
  }
}

/**
 * 将当前登录用户的 push token 同步到 profiles.push_token（登录后调用一次即可）。
 */
export async function syncPushToken(): Promise<void> {
  try {
    const granted = await ensureNotificationPermission();
    if (!granted) return;

    const token = await getExpoPushToken();
    if (!token) return;

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;

    const { error } = await supabase
      .from('profiles')
      .update({ push_token: token })
      .eq('id', auth.user.id);
    if (error) {
      console.error('Failed to store push token:', error);
    }
  } catch (err) {
    console.error('syncPushToken error:', err);
  }
}

/**
 * 立即展示一条本地通知（in-app：应用在前台也能弹出横幅）。
 */
export async function showLocalNotification(title: string, body: string): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        data: {},
      },
      trigger: null, // 立即展示
    });
  } catch (err) {
    console.error('Failed to show local notification:', err);
  }
}
