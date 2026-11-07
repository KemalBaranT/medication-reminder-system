export const NOTIFICATION_QUEUE = 'medication-notifications';

/**
 * Kademeli bildirim zaman çizelgesinin BullMQ iş adları. Her planlanmış doz
 * için üç gecikmeli iş kuyruğa alınır:
 *
 * | Kademe  | Tetiklenme                     | İş             |
 * |---------|--------------------------------|----------------|
 * | Hazırlık| Planlanan saatten 15 dk önce   | `PREPARE_JOB`  |
 * | Zamanı  | Tam planlanan saatte           | `NOTIFY_JOB`   |
 * | Gecikme | Planlanan saatten 30 dk sonra  | `ESCALATE_JOB` |
 *
 * Aynı eşikler mobil istemcinin yerel bildirim planlayıcısında
 * (`mobile-expo/src/notifications/doseAlertPolicy.ts`) ve web panelinin
 * bildirim merkezinde (`web/src/lib/doseAlerts.ts`) birebir kullanılır; üç
 * yüzey aynı dozu aynı anda aynı kademede gösterir.
 */
export const PREPARE_JOB = 'prepare';
export const NOTIFY_JOB = 'notify';
export const ESCALATE_JOB = 'escalate';

/** "Hazırlık" kademesinin planlanan saatten ne kadar önce tetikleneceği (dakika). */
export const PREPARE_LEAD_MINUTES = 15;

/**
 * "Gecikme" kademesinin varsayılan eşiği (dakika). `ESCALATION_MINUTES`
 * ortam değişkeniyle hastane bazında değiştirilebilir; değiştirilirse mobil
 * ve web istemcilerindeki eşik de aynı değere çekilmelidir.
 */
export const DEFAULT_OVERDUE_MINUTES = 30;

// Recete olusturulduktan sonra ne kadar ileriye kadar uygulama zamani uretilecek
export const GENERATION_HORIZON_HOURS = 48;
