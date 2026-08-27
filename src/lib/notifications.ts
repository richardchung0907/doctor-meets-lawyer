import { Platform, AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';

/**
 * 前台收到通知时的展示策略（in-app 横幅）。
 *
 * 去重策略：
 * - 远程推送（trigger.type === 'push'）在前台时**不显示**——前台新消息已由
 *   App.tsx 的 Realtime 订阅 + 本地通知（showLocalNotification）展示，避免双横幅。
 * - 本地通知（trigger.type !== 'push'）与后台状态不受影响：后台由系统直接展示推送。
 */
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const isForeground = AppState.currentState === 'active';
    const trigger = notification.request.trigger;
    const isRemotePush =
      !!trigger && (trigger as { type?: string }).type === 'push';
    const suppress = isForeground && isRemotePush;
    return {
      shouldShowAlert: !suppress,
      shouldShowBanner: !suppress,
      shouldShowList: !suppress,
      shouldPlaySound: !suppress,
      shouldSetBadge: false,
    };
  },
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
 * projectId 优先从 EAS 配置 / app.json 读取；缺失时降级为本地通知
 * （仅 in-app），不再报错。
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
    // 兼容多种 manifest 形态：EAS 配置 / expoClient.extra / manifest2 顶层 extra
    const manifestExtra = Constants.manifest2?.extra as
      | { eas?: { projectId?: string } }
      | undefined;
    const projectId =
      Constants.easConfig?.projectId ??
      (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
      manifestExtra?.eas?.projectId;
    if (!projectId) {
      console.warn(
        'No EAS projectId configured; remote push is disabled. Run `npx eas init` to enable it.'
      );
      return null;
    }
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
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
