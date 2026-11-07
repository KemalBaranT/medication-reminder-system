import type { Permissions } from '../auth/permissions';
import { DoseUrgency } from './doseTiming';

export interface ActionAvailability {
  enabled: boolean;
  /** Eylem kapalıysa kullanıcıya gösterilecek kısa neden. */
  reason?: string;
}

/**
 * Bir doz üzerinde "Verildi" kaydına götüren eylemlerin (manuel onay ve QR
 * doğrulama) açık olup olmadığına karar veren tek kural.
 *
 * Ana ekrandaki kaydırma hareketleri ve zaman çizelgesindeki düğmeler aynı
 * kuralı kullanır; bir eylemin bir ekranda açık, diğerinde kapalı olması
 * mümkün değildir.
 *
 * - Kaydedilmiş bir doz yeniden kaydedilemez (backend de 409 döndürür);
 *   God Mode bu kuralı aşmaz, çünkü bu bir yetki değil veri bütünlüğü
 *   kuralıdır.
 * - Doz kaydetme yetkisi olmayan roller (doktor, sekreter) eylemi kilitli
 *   görür.
 * - Saati henüz gelmemiş dozlar, erken uygulama penceresine girene kadar
 *   kilitlidir. God Mode bu pencereyi kaldırır.
 */
export function administrationAvailability(urgency: DoseUrgency, permissions: Permissions): ActionAvailability {
  if (urgency === DoseUrgency.Done) return { enabled: false, reason: 'Zaten verildi' };
  if (!permissions.canAdministerDoses) return { enabled: false, reason: 'Yetkiniz yok' };
  if (urgency === DoseUrgency.Upcoming && !permissions.canBypassTimingWindow) {
    return { enabled: false, reason: 'Saati gelmedi' };
  }
  return { enabled: true };
}
