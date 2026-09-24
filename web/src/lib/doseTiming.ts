/**
 * Esnek ilaç uygulama akışının zaman kuralları. Hasta dosyasındaki doz
 * listesi, "İlacı Ver" eyleminin nerede gösterileceğine ve bir dozun
 * gecikmiş/erken/zamanında sayılacağına bu tek kaynaktan karar verir;
 * böylece rozet, eylem düğmesi ve onay penceresi aynı kuralı uygular.
 *
 * Bu kurallar yalnızca arayüz yönlendirmesidir: backend dozu planlanan
 * saate göre reddetmez ve uygulama zamanını daima sunucu saatiyle
 * damgalar (bkz. AdministrationLogsService.resolvePerformedAt).
 */

/**
 * Klinik sonucu henüz kaydedilmemiş doz durumları. Backend'in
 * RECORDABLE_STATUSES listesiyle birebir aynıdır; `missed` dahildir,
 * çünkü zamanlayıcının "kaçırıldı" saydığı bir doz geç de olsa verilebilir
 * ve bu gerçek kayıt altına alınmalıdır.
 */
export const OPEN_DOSE_STATUSES = ['pending', 'notified', 'missed'];

/**
 * Planlanan saatten bu kadar dakika sapma "zamanında" kabul edilir.
 * Servis yoğunluğunda dakikası dakikasına uygulama beklenemez; bu tolerans
 * dışındaki sapmalar engellenmez, yalnızca görünür kılınır.
 */
export const ON_TIME_TOLERANCE_MINUTES = 15;

/**
 * Bir dozun planlanan saatinden en fazla bu kadar önce "İlacı Ver"
 * eylemi sunulur. Liste günler sonrasına ait dozları da içerdiği için,
 * pencere olmadan yanlış satıra tıklayıp ertesi günün dozunu kapatmak
 * mümkün olurdu.
 */
export const EARLY_ADMINISTRATION_WINDOW_MINUTES = 60;

const MINUTE_MS = 60 * 1000;

export type DoseTimingKind = 'onTime' | 'late' | 'early';

export interface DoseTiming {
  kind: DoseTimingKind;
  /** Planlanan saatten mutlak sapma, dakika cinsinden. */
  minutes: number;
}

/** Bir uygulama anının planlanan saate göre sapmasını sınıflandırır. */
export function classifyDoseTiming(scheduledIso: string, at: Date = new Date()): DoseTiming {
  const diffMinutes = Math.round((at.getTime() - new Date(scheduledIso).getTime()) / MINUTE_MS);
  const minutes = Math.abs(diffMinutes);
  if (minutes <= ON_TIME_TOLERANCE_MINUTES) return { kind: 'onTime', minutes };
  return { kind: diffMinutes > 0 ? 'late' : 'early', minutes };
}

/** Doz açık ve planlanan saati erken uygulama penceresine girmiş mi. */
export function isDoseActionable(dose: { status: string; scheduledTime: string }, now: Date = new Date()): boolean {
  if (!OPEN_DOSE_STATUSES.includes(dose.status)) return false;
  return new Date(dose.scheduledTime).getTime() - now.getTime() <= EARLY_ADMINISTRATION_WINDOW_MINUTES * MINUTE_MS;
}

/** Doz açık ve planlanan saati tolerans payından fazla geçmiş mi. */
export function isDoseOverdue(dose: { status: string; scheduledTime: string }, now: Date = new Date()): boolean {
  return OPEN_DOSE_STATUSES.includes(dose.status) && classifyDoseTiming(dose.scheduledTime, now).kind === 'late';
}
