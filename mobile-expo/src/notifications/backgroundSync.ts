import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import { api } from '../api/endpoints';
import { derivePermissions } from '../auth/permissions';
import { tokenStorage } from '../auth/tokenStorage';
import { syncDoseNotifications } from './doseNotificationScheduler';

/**
 * Uygulama kapalıyken yerel bildirim planını güncel tutan arka plan
 * senkronizasyonu.
 *
 * ## Neden gerekli
 * Yerel bildirimler cihazdaki son iş listesine göre planlanır. Uygulama
 * günlerce açılmazsa, bu sürede eklenen reçeteler, başka hemşireye
 * atanan veya saati düzeltilen dozlar cihaza yansımazdı. Aşağıdaki iki
 * kanal, planı uygulama açılmadan da sunucuyla eşitler:
 *
 * 1. **Periyodik arka plan görevi** (`expo-background-task`): İşletim
 *    sistemi en erken {@link BACKGROUND_INTERVAL_MINUTES} dakikada bir
 *    (pil ve kullanım durumuna göre daha seyrek olabilir) uygulamayı
 *    uyandırır. Expo Go dahil her ortamda çalışır; sunucu erişilemese de
 *    mevcut plan korunur.
 * 2. **Sunucu sinyaliyle uyanma** (`dose_sync`): Backend her kademe anında
 *    (bkz. backend `DoseAlertDispatcher`) cihaza başlıksız, sessiz bir
 *    push mesajı gönderir; `expo-notifications` arka plan görevi bu
 *    mesajla çalışıp planı hemen yeniler. Uzak bildirim gerektirdiği için
 *    development/production build'de çalışır (Expo Go Android uzak
 *    bildirimi desteklemez).
 *
 * İki görev de aynı {@link runBackgroundSync} fonksiyonunu çağırır.
 * `TaskManager.defineTask` çağrıları modül seviyesinde yapılmalıdır;
 * işletim sistemi uygulamayı arka planda başlattığında React ağacı
 * kurulmadan önce görev tanımının bulunması gerekir. Bu dosya bu yüzden
 * kök düzen (`app/_layout.tsx`) tarafından yan etki olarak içe aktarılır.
 */
export const BACKGROUND_SYNC_TASK = 'ilactakip.dose-notification-sync';
export const REMOTE_SYNC_TASK = 'ilactakip.remote-dose-sync';

/** İşletim sisteminin izin verdiği en kısa periyot (dakika). */
const BACKGROUND_INTERVAL_MINUTES = 15;

/**
 * Oturum açık ise iş listesini sunucudan çeker ve yerel bildirim planını
 * uzlaştırır. Oturum yoksa hiçbir şey yapmaz; oturum kapatma zaten tüm
 * doz bildirimlerini temizler.
 */
export async function runBackgroundSync(): Promise<boolean> {
  const user = await tokenStorage.getUser();
  if (!user || !(await tokenStorage.getAccessToken())) return true;
  try {
    const items = await api.mySchedule();
    await syncDoseNotifications(items, derivePermissions(user).canAdministerDoses);
    return true;
  } catch {
    return false;
  }
}

TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  const ok = await runBackgroundSync();
  return ok ? BackgroundTask.BackgroundTaskResult.Success : BackgroundTask.BackgroundTaskResult.Failed;
});

TaskManager.defineTask<Notifications.NotificationTaskPayload>(REMOTE_SYNC_TASK, async ({ data }) => {
  const payload = data && 'data' in data ? (data.data as Record<string, unknown> | undefined) : undefined;
  if (payload?.type === 'dose_sync' || payload?.type === 'medication_overdue') {
    await runBackgroundSync();
  }
  return Notifications.BackgroundNotificationTaskResult.NewData;
});

/**
 * İki arka plan görevini işletim sistemine kaydeder. Oturum açıldıktan sonra
 * çağrılır; tekrar çağrılması güvenlidir. Kayıt başarısız olursa (ör. arka
 * plan yenileme kullanıcı tarafından kapatılmış) uygulama çalışmaya devam
 * eder; ön plandaki senkron her durumda planı günceller.
 */
export async function registerBackgroundSync(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Available && !(await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK))) {
      await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, { minimumInterval: BACKGROUND_INTERVAL_MINUTES });
    }
  } catch {
    // Arka plan görevleri bu cihazda kullanılamıyor; ön plan senkronu yeterli.
  }
  try {
    await Notifications.registerTaskAsync(REMOTE_SYNC_TASK);
  } catch {
    // Uzak bildirim desteklenmeyen ortam (ör. Expo Go Android).
  }
}

/** Oturum kapatıldığında arka plan görevlerini kaldırır. */
export async function unregisterBackgroundSync(): Promise<void> {
  await Promise.allSettled([
    BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK),
    Notifications.unregisterTaskAsync(REMOTE_SYNC_TASK),
  ]);
}
