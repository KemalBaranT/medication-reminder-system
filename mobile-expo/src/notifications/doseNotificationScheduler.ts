import * as Notifications from 'expo-notifications';

import { isOpenStatus } from '../domain/doseTiming';
import type { ScheduleItem } from '../domain/types';
import {
  buildContent,
  CHANNELS,
  DOSE_ALERT_TIERS,
  NOTIFICATION_ID_PREFIX,
  notificationId,
  tierTriggerTime,
  type DoseAlertTier,
} from './doseAlertPolicy';

/**
 * Cihazda aynı anda bekleyebilecek en fazla yerel bildirim sayısı. iOS,
 * uygulama başına bekleyen yerel bildirimleri 64 ile sınırlar ve fazlasını
 * sessizce düşürür; sınırın altında kalınarak en yakın dozların hiçbir
 * zaman düşmemesi garanti edilir. Daha ileri saatlerin bildirimleri,
 * sonraki senkronlarda (ön plan, arka plan görevi veya sunucu sinyali)
 * sırası geldikçe planlanır.
 */
const MAX_PENDING = 60;

/** Tetiklenme anına bu kadardan az kalmış bir bildirim planlanmaz; saat farkı yüzünden anında düşmesini önler. */
const MIN_LEAD_MS = 5_000;

/**
 * Bu uygulama oturumunda "yetişme" amacıyla anında gösterilmiş gecikme
 * uyarıları. Uygulama, gecikme anı geçtikten sonra açıldığında kritik uyarı
 * bir kez hemen gösterilir; iOS'ta kullanıcı uyarıyı kapattıysa her
 * senkronda yeniden belirmemesi için burada tutulur.
 */
const caughtUpOverdue = new Set<string>();

/**
 * Oturumdaki kullanıcının iş listesini, cihazdaki planlanmış yerel
 * bildirimlerle uzlaştırır (reconcile).
 *
 * **Ne zaman çağrılır:** İş listesi her değiştiğinde (ön planda yenileme,
 * doz kaydı), arka plan görevinde (en az 15 dakikada bir) ve sunucunun
 * sessiz senkron sinyali geldiğinde (bkz. `backgroundSync.ts`). Fonksiyon
 * idempotent'tir; aynı liste ile tekrar çağrılması hiçbir şeyi değiştirmez.
 *
 * **Adımlar:**
 * 1. Açık dozların gelecekteki kademe tetiklenmeleri hesaplanır ve en
 *    yakın {@link MAX_PENDING} tanesi "istenen plan" olarak seçilir.
 * 2. Cihazda planlı olup istenen planda olmayan (doz kaydedildi, saati
 *    değişti, başka hemşireye atandı) bildirimler iptal edilir.
 * 3. İstenen planda olup cihazda olmayan bildirimler planlanır.
 * 4. Ekranda duran ama dozu artık açık olmayan bildirimler (özellikle
 *    kaydırılamayan kritik gecikme uyarısı) bildirim alanından kaldırılır;
 *    hemşire dozu kaydettiği anda uyarı kaybolur.
 * 5. Gecikme anı geçmiş ama hâlâ açık dozlar için kritik uyarı bir kez
 *    anında gösterilir; uygulama o sırada kapalı olsa bile uyarı kaybolmaz.
 *
 * @param enabled Kullanıcı doz kaydetme yetkisine sahip değilse (doktor,
 *   sekreter) tüm doz bildirimleri kaldırılır; uygulamayı yalnızca
 *   izlemek için kullanan roller alarmla bölünmez.
 */
export async function syncDoseNotifications(items: ScheduleItem[], enabled: boolean, now = Date.now()): Promise<void> {
  const open = enabled ? items.filter((i) => isOpenStatus(i.status)) : [];
  const openIds = new Set(open.map((i) => i.id));

  const desired = open
    .flatMap((dose) =>
      DOSE_ALERT_TIERS.map((tier) => ({ dose, tier, at: tierTriggerTime(tier, dose.scheduledTime) })),
    )
    .filter((entry) => entry.at - now > MIN_LEAD_MS)
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_PENDING);

  const desiredById = new Map(desired.map((entry) => [notificationId(entry.dose.id, entry.tier), entry]));

  const scheduled = (await Notifications.getAllScheduledNotificationsAsync()).filter((r) =>
    r.identifier.startsWith(NOTIFICATION_ID_PREFIX),
  );
  const scheduledIds = new Set<string>();

  await Promise.all(
    scheduled.map(async (request) => {
      const entry = desiredById.get(request.identifier);
      const plannedFor = (request.content.data as { scheduledTime?: string } | undefined)?.scheduledTime;
      if (entry && plannedFor === entry.dose.scheduledTime) {
        scheduledIds.add(request.identifier);
        return;
      }
      await Notifications.cancelScheduledNotificationAsync(request.identifier);
    }),
  );

  for (const [identifier, { dose, tier, at }] of desiredById) {
    if (scheduledIds.has(identifier)) continue;
    const content = buildContent(tier, dose);
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: { ...content, data: { ...content.data, scheduledTime: dose.scheduledTime } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNELS[tier] },
    });
  }

  await dismissClosedDoseNotifications(openIds);
  await presentMissedOverdueAlerts(open, now);
}

/** Dozu artık açık olmayan (kaydedilmiş veya listeden çıkmış) ekrandaki bildirimleri kaldırır. */
async function dismissClosedDoseNotifications(openIds: Set<string>): Promise<void> {
  const presented = await Notifications.getPresentedNotificationsAsync();
  await Promise.all(
    presented
      .filter((n) => n.request.identifier.startsWith(NOTIFICATION_ID_PREFIX))
      .filter((n) => {
        const scheduleId = (n.request.content.data as { scheduleId?: string } | undefined)?.scheduleId;
        return scheduleId != null && !openIds.has(scheduleId);
      })
      .map((n) => Notifications.dismissNotificationAsync(n.request.identifier)),
  );
}

/**
 * Gecikme anı geçmiş, hâlâ açık ve ekranda gösterilmeyen dozlar için kritik
 * uyarıyı hemen gösterir. Bu, uygulama kapalıyken veya cihaz kapalıyken
 * tetiklenme anı kaçırılmış uyarıları telafi eder.
 */
async function presentMissedOverdueAlerts(open: ScheduleItem[], now: number): Promise<void> {
  const presented = new Set((await Notifications.getPresentedNotificationsAsync()).map((n) => n.request.identifier));
  const tier: DoseAlertTier = 'overdue';
  for (const dose of open) {
    const identifier = notificationId(dose.id, tier);
    if (tierTriggerTime(tier, dose.scheduledTime) > now) continue;
    if (presented.has(identifier) || caughtUpOverdue.has(identifier)) continue;
    caughtUpOverdue.add(identifier);
    const content = buildContent(tier, dose);
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: { ...content, data: { ...content.data, scheduledTime: dose.scheduledTime } },
      trigger: { channelId: CHANNELS[tier] },
    });
  }
}

/** Oturum kapatıldığında cihazdaki tüm doz bildirimlerini temizler; başka bir personelin telefonu devralması hasta verisi sızdırmamalıdır. */
export async function clearDoseNotifications(): Promise<void> {
  await syncDoseNotifications([], false);
  caughtUpOverdue.clear();
}
