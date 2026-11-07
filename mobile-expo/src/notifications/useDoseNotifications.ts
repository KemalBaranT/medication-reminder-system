import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { api } from '../api/endpoints';
import { useSession } from '../auth/SessionProvider';
import { useSchedule } from '../state/ScheduleProvider';
import { registerBackgroundSync, unregisterBackgroundSync } from './backgroundSync';
import { ensureNotificationChannels } from './doseAlertPolicy';
import { clearDoseNotifications, syncDoseNotifications } from './doseNotificationScheduler';

const notificationsSupported = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * Uygulama ön plandayken gelen bildirimlerin nasıl gösterileceği.
 * Sunucunun sessiz senkron sinyali (`dose_sync`) hiçbir zaman
 * gösterilmez; yalnızca iş listesini yeniletir. Doz uyarıları, hemşire
 * uygulamayı kullanırken de banner ve ses ile gösterilir; "Hazırlık"
 * kademesi ise ön planda da sessizdir.
 */
if (notificationsSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data as { type?: string; tier?: string } | undefined;
      if (data?.type === 'dose_sync') {
        return { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
      }
      const silent = data?.tier === 'prepare';
      return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: !silent, shouldSetBadge: false };
    },
  });
}

/**
 * Kademeli bildirim sistemini oturum ve iş listesi yaşam döngüsüne bağlar.
 * Kök düzende, oturum ve iş listesi sağlayıcılarının içinde bir kez
 * çağrılır.
 *
 * - **Oturum açıldığında:** Android kanalları kurulur, bildirim izni
 *   istenir, arka plan senkron görevleri kaydedilir ve (destekleniyorsa)
 *   Expo push token'ı backend'e kaydedilir.
 * - **İş listesi her değiştiğinde:** Yerel bildirim planı uzlaştırılır;
 *   kaydedilen dozun bekleyen ve ekrandaki bildirimleri anında kalkar.
 * - **Oturum kapandığında:** Tüm doz bildirimleri ve arka plan görevleri
 *   kaldırılır; cihazı devralan başka bir personel önceki kullanıcının
 *   hastalarına ait uyarı almaz.
 * - **Bildirime dokunulduğunda:** `data.url` ile gelen hasta sayfası
 *   açılır. Uygulama bildirimle soğuk başlatıldıysa veya oturum henüz
 *   geri yüklenmediyse yönlendirme oturum hazır olana kadar bekletilir.
 */
export function useDoseNotifications(): void {
  const { status, permissions } = useSession();
  const { items, loading, refresh } = useSchedule();
  const pendingUrl = useRef<string | null>(null);
  const wasSignedIn = useRef(false);
  const statusRef = useRef(status);
  statusRef.current = status;

  /** Bekleyen derin bağlantıyı, oturum hazırsa açar. */
  const flushPendingUrl = useRef(() => {
    if (!pendingUrl.current || statusRef.current !== 'signedIn') return;
    const url = pendingUrl.current;
    pendingUrl.current = null;
    Notifications.clearLastNotificationResponse();
    router.push(url as Href);
  }).current;

  useEffect(() => {
    if (!notificationsSupported) return;
    if (status === 'signedIn') {
      wasSignedIn.current = true;
      void (async () => {
        await ensureNotificationChannels();
        const { granted } = await Notifications.requestPermissionsAsync({
          ios: { allowAlert: true, allowSound: true, allowBadge: false },
        });
        if (!granted) return;
        await registerBackgroundSync();
        await registerPushToken();
      })();
    } else if (status === 'signedOut' && wasSignedIn.current) {
      wasSignedIn.current = false;
      void clearDoseNotifications();
      void unregisterBackgroundSync();
    }
  }, [status]);

  useEffect(() => {
    if (!notificationsSupported || status !== 'signedIn' || loading) return;
    void syncDoseNotifications(items, permissions.canAdministerDoses).catch(() => undefined);
  }, [items, loading, status, permissions.canAdministerDoses]);

  useEffect(() => {
    if (!notificationsSupported) return;
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as { type?: string } | undefined;
      if (data?.type === 'dose_sync' || data?.type === 'medication_overdue') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  useEffect(() => {
    if (!notificationsSupported) return;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const url = (response.notification.request.content.data as { url?: unknown } | undefined)?.url;
      if (typeof url === 'string' && url.startsWith('/')) pendingUrl.current = url;
      flushPendingUrl();
    };
    open(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [flushPendingUrl]);

  useEffect(() => {
    if (status === 'signedIn') flushPendingUrl();
  }, [status, flushPendingUrl]);
}

/**
 * Cihazın Expo push token'ını backend'e kaydeder; sunucunun sessiz senkron
 * sinyali ve başhemşire eskalasyonu bu token'a gönderilir.
 *
 * Aşağıdaki durumlarda kayıt sessizce atlanır ve sistem yalnızca yerel
 * bildirim + periyodik arka plan senkronuyla çalışır:
 * - Emülatör/simülatör (push token alınamaz).
 * - Expo Go Android (SDK 53'ten beri uzak bildirim desteklenmez).
 * - EAS proje kimliği tanımlı değil (`npx eas-cli init` ile oluşturulur;
 *   `app.json` → `extra.eas.projectId`).
 */
async function registerPushToken(): Promise<void> {
  if (!Device.isDevice) return;
  if (Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return;
  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) return;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.registerDevice(data, Platform.OS as 'android' | 'ios');
  } catch {
    // Token alınamadı veya sunucuya ulaşılamadı; bir sonraki oturum açılışında yeniden denenir.
  }
}
