import { DoseUrgency, isOpenStatus, urgencyAt } from './doseTiming';
import type { ScheduleItem } from './types';

/**
 * Ana ekrandaki tek bir hasta kartı: hastanın o anda en çok önem taşıyan
 * dozu ve kartta gösterilmeyen dozlar hakkında özet.
 */
export interface PatientWorkItem {
  /** Hastanın bileklik kodu; kart anahtarı ve detay sayfası parametresidir. */
  patientKey: string;
  /** Kartta gösterilen ve kaydırma hareketlerinin hedeflediği doz. */
  dose: ScheduleItem;
  urgency: DoseUrgency;
  /**
   * Kartta gösterilmeyen, ancak saati gelmiş veya gecikmiş diğer dozların
   * sayısı. Tekil kart kalabalığı giderirken birikmiş işi gizlememelidir;
   * bu sayı kartta açıkça bir rozet olarak gösterilir.
   */
  otherPendingCount: number;
  /** Gösterilen dozdan sonraki ilk açık dozun planlanan saati; kartta "Sonraki doz" olarak gösterilir. */
  nextDoseAt: string | null;
  /**
   * Hastanın iş listesindeki tüm ilaç adları. Kart yalnızca tek dozu
   * gösterse de arama, hastanın diğer ilaçlarıyla da eşleşebilmelidir;
   * aksi halde kartta o an görünmeyen bir ilacı aramak hastayı gizlerdi.
   */
  medicationNames: string[];
}

/**
 * "Verildi" olarak işaretlenen bir dozun, hastanın sıradaki dozuna geçmeden
 * önce kartta yeşil olarak kalacağı süre. Bu süre olmadan kart, onaydan
 * hemen sonra aynı hastanın bir sonraki ilacına atlar ve hemşire kaydın
 * gerçekten alındığını göremezdi.
 */
export const CONFIRMATION_HOLD_MS = 4_000;

/**
 * Sunucudan gelen düz doz listesini, hasta başına TEK kart olacak şekilde
 * indirger.
 *
 * **Neden hasta başına tekil kart:** Bir hastanın gün içindeki tüm
 * ilaçları alt alta dizildiğinde ana ekran taşar ve "şimdi ne yapmalıyım"
 * sorusunun cevabı kaybolur. Ana ekran yalnızca hasta başına en acil
 * eylemi gösterir; günün tam planı karta dokunulduğunda açılan zaman
 * çizelgesindedir.
 *
 * **Kartta hangi doz gösterilir** (öncelik sırasıyla):
 * 1. Az önce bu cihazdan "Verildi" olarak onaylanan doz
 *    ({@link CONFIRMATION_HOLD_MS} boyunca, yeşil onay geri bildirimi için).
 * 2. Gecikmiş dozlar varsa, planlanan saati şu ana en yakın olanı.
 * 3. Yoksa saati gelmiş (erken uygulama penceresindeki) doz.
 * 4. Yoksa saati henüz gelmemiş en yakın doz ("Bekliyor").
 * 5. Hiç açık doz kalmadıysa, bugün en son verilen doz (yeşil kart).
 *
 * Kartlar en acil olan en üstte olacak şekilde, eşitlikte planlanan saate
 * göre sıralanır.
 */
export function buildPatientWorklist(
  items: ScheduleItem[],
  now: number,
  recentlyConfirmed: ReadonlyMap<string, number>,
): PatientWorkItem[] {
  const byPatient = new Map<string, ScheduleItem[]>();
  for (const item of items) {
    const key = item.patientWristbandCode || item.patientName;
    const bucket = byPatient.get(key);
    if (bucket) bucket.push(item);
    else byPatient.set(key, [item]);
  }

  const result: PatientWorkItem[] = [];
  for (const [patientKey, doses] of byPatient) {
    const sorted = [...doses].sort((a, b) => Date.parse(a.scheduledTime) - Date.parse(b.scheduledTime));
    const withUrgency = sorted.map((dose) => ({ dose, urgency: urgencyAt(dose.status, dose.scheduledTime, now) }));

    const held = withUrgency.find(({ dose }) => {
      const confirmedAt = recentlyConfirmed.get(dose.id);
      return confirmedAt !== undefined && now - confirmedAt < CONFIRMATION_HOLD_MS;
    });

    const closestTo = (list: typeof withUrgency) =>
      list.reduce((best, cur) =>
        Math.abs(Date.parse(cur.dose.scheduledTime) - now) < Math.abs(Date.parse(best.dose.scheduledTime) - now)
          ? cur
          : best,
      );

    const overdue = withUrgency.filter((d) => d.urgency === DoseUrgency.Overdue);
    const due = withUrgency.filter((d) => d.urgency === DoseUrgency.Due);
    const upcoming = withUrgency.filter((d) => d.urgency === DoseUrgency.Upcoming);
    const done = withUrgency.filter((d) => d.urgency === DoseUrgency.Done);

    const shown =
      held ??
      (overdue.length > 0 ? closestTo(overdue) : undefined) ??
      (due.length > 0 ? closestTo(due) : undefined) ??
      upcoming[0] ??
      done[done.length - 1];
    if (!shown) continue;

    const shownTime = Date.parse(shown.dose.scheduledTime);
    const next = sorted.find(
      (d) => d.id !== shown.dose.id && isOpenStatus(d.status) && Date.parse(d.scheduledTime) > shownTime,
    );

    result.push({
      patientKey,
      dose: shown.dose,
      urgency: shown.urgency,
      otherPendingCount: [...overdue, ...due].filter((d) => d.dose.id !== shown.dose.id).length,
      nextDoseAt: next?.scheduledTime ?? null,
      medicationNames: [...new Set(sorted.map((d) => d.medicationName))],
    });
  }

  return result.sort(
    (a, b) => a.urgency - b.urgency || Date.parse(a.dose.scheduledTime) - Date.parse(b.dose.scheduledTime),
  );
}

/** "3. Kat · Oda 133 · Yatak 7" biçiminde, eksik alanları atlayan konum metni. */
export function formatLocation(p: { floor: string | null; roomNo: string | null; bedNo: string | null }): string {
  const parts = [
    p.floor ? `${p.floor}. Kat` : null,
    p.roomNo ? `Oda ${p.roomNo}` : null,
    p.bedNo ? `Yatak ${p.bedNo}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Konum belirtilmemiş';
}
