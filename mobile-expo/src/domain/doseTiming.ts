import type { ScheduleStatus } from './types';

/**
 * Esnek ilaç uygulama akışının zaman kuralları.
 *
 * Eşikler, web panelindeki `lib/doseTiming.ts` ile aynıdır; iki istemci
 * aynı dozu aynı anda aynı şekilde sınıflandırmalıdır. Bu kurallar
 * yalnızca arayüz yönlendirmesidir: backend dozu planlanan saate göre
 * reddetmez ve uygulama zamanını daima kendi saatiyle damgalar.
 */
export const DoseTimingRules = {
  /**
   * Klinik sonucu henüz kaydedilmemiş durumlar. Backend'in
   * `RECORDABLE_STATUSES` listesiyle aynıdır; `missed` dahildir, çünkü
   * zamanlayıcının "kaçırıldı" saydığı bir doz geç de olsa verilebilir ve
   * bu gerçek kayıt altına alınmalıdır.
   */
  openStatuses: new Set<ScheduleStatus>(['pending', 'notified', 'missed']),

  /**
   * Planlanan saatten bu kadar sapma "zamanında" sayılır. Servis
   * yoğunluğunda dakikası dakikasına uygulama beklenemez.
   */
  onTimeToleranceMs: 15 * 60_000,

  /**
   * Planlanan saatten en fazla bu kadar önce manuel onay sunulur. Reçete
   * sonraki saatlerin dozlarını da içerdiği için, pencere olmadan hızlı bir
   * kaydırma hareketi akşam dozunu sabahtan kapatabilirdi. Super Admin
   * (God Mode) bu pencereyle sınırlı değildir.
   */
  earlyWindowMs: 60 * 60_000,
} as const;

/**
 * Bir dozun ana ekrandaki aciliyet kademesi. Değerlerin sırası, ana ekranın
 * yukarıdan aşağıya sırasıdır: en acil olan en üstte.
 */
export enum DoseUrgency {
  /** Planlanan saati tolerans payından fazla geçmiş (Gecikmiş / Kaçırıldı). */
  Overdue = 0,
  /** Saati gelmiş veya erken uygulama penceresi içinde. */
  Due = 1,
  /** Saati henüz gelmemiş (Bekliyor). */
  Upcoming = 2,
  /** Klinik sonucu kaydedilmiş (Verildi). */
  Done = 3,
}

export function isOpenStatus(status: ScheduleStatus): boolean {
  return DoseTimingRules.openStatuses.has(status);
}

/**
 * Bir dozun verilen andaki aciliyet kademesi. Kural bildirim durumuna değil
 * saate bakar: bildirim altyapısı gecikse veya hiç çalışmasa da geciken doz
 * kırmızı görünür.
 */
export function urgencyAt(status: ScheduleStatus, scheduledTime: string, now: number): DoseUrgency {
  if (!isOpenStatus(status)) return DoseUrgency.Done;
  const diff = now - Date.parse(scheduledTime);
  if (diff > DoseTimingRules.onTimeToleranceMs) return DoseUrgency.Overdue;
  if (-diff <= DoseTimingRules.earlyWindowMs) return DoseUrgency.Due;
  return DoseUrgency.Upcoming;
}

/** Planlanan saat ile verilen an arasındaki sapmanın okunabilir etiketi. */
export function describeDeviation(scheduledTime: string, at: number): string {
  const diffMin = Math.round((at - Date.parse(scheduledTime)) / 60_000);
  const abs = Math.abs(diffMin);
  if (abs * 60_000 <= DoseTimingRules.onTimeToleranceMs) return 'Zamanında';
  const duration = abs < 60 ? `${abs} dk` : `${Math.floor(abs / 60)} sa ${abs % 60} dk`;
  return diffMin > 0 ? `${duration} gecikti` : `${duration} sonra`;
}

export const urgencyLabels: Record<DoseUrgency, string> = {
  [DoseUrgency.Overdue]: 'Gecikmiş',
  [DoseUrgency.Due]: 'Saati Geldi',
  [DoseUrgency.Upcoming]: 'Bekliyor',
  [DoseUrgency.Done]: 'Verildi',
};
