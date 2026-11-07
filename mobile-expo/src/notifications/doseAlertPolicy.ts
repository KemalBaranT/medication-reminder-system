import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { ScheduleItem } from '../domain/types';
import { formatLocation } from '../domain/worklist';
import { formatTime } from '../utils/format';

/**
 * Kademeli bildirim (Escalation Alert) zaman çizelgesinin istemci tarafı
 * tanımı.
 *
 * | Kademe   | Tetiklenme        | Sunum                                             |
 * |----------|-------------------|---------------------------------------------------|
 * | Hazırlık | Saatten 15 dk önce| Sessiz; bildirim listesine düşer, ses/titreşim yok |
 * | Zamanı   | Tam saatinde      | Kurumsal "chime" sesi, zamana duyarlı öncelik     |
 * | Gecikme  | Saatten 30 dk sonra| Kırmızı, en yüksek öncelik, kaydırılamaz (sticky)|
 *
 * Eşikler backend'deki `schedule.constants.ts` (`PREPARE_LEAD_MINUTES`,
 * `DEFAULT_OVERDUE_MINUTES` / `ESCALATION_MINUTES`) ve web panelindeki
 * `lib/doseAlerts.ts` ile aynı tutulmalıdır.
 *
 * Not: Arayüzdeki kırmızı "Gecikti" etiketi 15 dk tolerans sonrasında
 * görünür (bkz. `DoseTimingRules.onTimeToleranceMs`); kritik bildirim ise
 * bilinçli olarak daha geç, 30. dakikada gelir. Etiket hemşireyi ekranda
 * yönlendirir, kritik bildirim ise ekrana bakmayan hemşireyi böler.
 */
export const DoseAlertTiming = {
  prepareLeadMs: 15 * 60_000,
  overdueAfterMs: 30 * 60_000,
} as const;

export type DoseAlertTier = 'prepare' | 'due' | 'overdue';

export const DOSE_ALERT_TIERS: readonly DoseAlertTier[] = ['prepare', 'due', 'overdue'];

/** Kademenin, dozun planlanan saatine göre tetiklenme anı. */
export function tierTriggerTime(tier: DoseAlertTier, scheduledTime: string): number {
  const t = Date.parse(scheduledTime);
  if (tier === 'prepare') return t - DoseAlertTiming.prepareLeadMs;
  if (tier === 'overdue') return t + DoseAlertTiming.overdueAfterMs;
  return t;
}

/**
 * Yerel bildirim kimliği. Kimlik doz ve kademeden deterministik olarak
 * türetilir; planlayıcı her senkronda aynı dozu aynı kimlikle tanır, mevcut
 * planı iptal etmeden eksikleri ekler ve kaydedilen dozun ekrandaki
 * bildirimini kimliğiyle kaldırabilir.
 */
export const NOTIFICATION_ID_PREFIX = 'dose-';

export function notificationId(scheduleId: string, tier: DoseAlertTier): string {
  return `${NOTIFICATION_ID_PREFIX}${scheduleId}-${tier}`;
}

/** Android bildirim kanalları. Backend'in Expo Push mesajlarındaki `channelId` değerleriyle aynıdır. */
export const CHANNELS = {
  prepare: 'dose-prepare',
  due: 'dose-due',
  overdue: 'dose-overdue',
} as const;

const BRAND_RED = '#C8102E';
const CHIME_SOUND = 'chime.wav';

/**
 * Özel bildirim sesi uygulama paketine config plugin ile gömülür; Expo Go
 * bu dosyayı içermediği için orada varsayılan sistem sesi kullanılır.
 * Development/production build'de hastaneye uygun "chime" sesi çalar.
 */
const customSoundAvailable = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
const alertSound = customSoundAvailable ? CHIME_SOUND : 'default';

/**
 * Android bildirim kanallarını oluşturur. Android 8+ sürümlerinde ses,
 * önem düzeyi ve titreşim bildirim başına değil kanal başına belirlenir ve
 * kanal bir kez oluşturulduktan sonra uygulama tarafından değiştirilemez
 * (yalnızca kullanıcı sistem ayarlarından değiştirebilir). Bu yüzden
 * kademeler ayrı kanallardır; kullanıcı örneğin "Hazırlık" kanalını
 * tamamen kapatıp kritik gecikme uyarılarını açık tutabilir.
 */
export async function ensureNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Promise.all([
    Notifications.setNotificationChannelAsync(CHANNELS.prepare, {
      name: 'İlaç Hazırlık Hatırlatması',
      description: 'Doz saatinden 15 dakika önce gelen sessiz hazırlık bildirimi.',
      importance: Notifications.AndroidImportance.LOW,
      sound: null,
      enableVibrate: false,
      showBadge: false,
    }),
    Notifications.setNotificationChannelAsync(CHANNELS.due, {
      name: 'İlaç Uygulama Zamanı',
      description: 'Doz saati geldiğinde çalan sesli bildirim.',
      importance: Notifications.AndroidImportance.HIGH,
      sound: alertSound,
      vibrationPattern: [0, 180, 120, 180],
      lightColor: BRAND_RED,
    }),
    Notifications.setNotificationChannelAsync(CHANNELS.overdue, {
      name: 'Gecikmiş İlaç (Kritik)',
      description: 'Doz 30 dakikadır uygulanmadığında gelen kalıcı kritik uyarı.',
      importance: Notifications.AndroidImportance.MAX,
      sound: alertSound,
      vibrationPattern: [0, 400, 200, 400, 200, 400],
      lightColor: BRAND_RED,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    }),
  ]);
}

/**
 * Bir kademenin bildirim içeriği. Bildirime dokunulduğunda açılacak ekran
 * `data.url` ile taşınır (`/patient/<bileklik kodu>?focus=<doz>`); derin
 * bağlantı işleyicisi bu yolu Expo Router ile doğrudan açar ve zaman
 * çizelgesi ilgili dozu vurgular.
 */
export function buildContent(tier: DoseAlertTier, dose: ScheduleItem): Notifications.NotificationContentInput {
  const time = formatTime(dose.scheduledTime);
  const where = `${dose.patientName} · ${formatLocation(dose)}`;
  const data = {
    tier,
    scheduleId: dose.id,
    url: `/patient/${encodeURIComponent(dose.patientWristbandCode)}?focus=${encodeURIComponent(dose.id)}`,
  };

  if (tier === 'prepare') {
    return {
      title: `Hazırlık · ${dose.medicationName}`,
      body: `${where}\n${time} dozu 15 dk sonra. ${dose.dosage}`,
      data,
      sound: false,
      priority: Notifications.AndroidNotificationPriority.LOW,
      interruptionLevel: 'passive',
    };
  }

  if (tier === 'due') {
    return {
      title: `Uygulama Zamanı · ${dose.medicationName}`,
      body: `${where}\n${dose.dosage} · Planlanan saat ${time}`,
      data,
      sound: alertSound,
      color: BRAND_RED,
      priority: Notifications.AndroidNotificationPriority.HIGH,
      interruptionLevel: 'timeSensitive',
    };
  }

  return {
    title: `GECİKMİŞ İLAÇ · ${dose.medicationName}`,
    body: `${where}\n${time} dozu 30 dakikadır uygulanmadı.`,
    data,
    sound: alertSound,
    color: BRAND_RED,
    sticky: true,
    autoDismiss: false,
    priority: Notifications.AndroidNotificationPriority.MAX,
    interruptionLevel: 'timeSensitive',
  };
}
