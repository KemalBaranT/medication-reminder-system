import { OPEN_DOSE_STATUSES } from './doseTiming';

/**
 * Kademeli bildirim sisteminin web paneli karşılığı.
 *
 * Eşikler backend (`schedule.constants.ts`) ve mobil istemci
 * (`notifications/doseAlertPolicy.ts`) ile aynıdır; bir doz üç yüzeyde
 * aynı anda aynı kademede görünür:
 *
 * | Kademe    | Zaman aralığı                  | Panelde                              |
 * |-----------|--------------------------------|--------------------------------------|
 * | `prepare` | Saatten 15 dk önce → saatine    | Bildirim merkezinde "Yaklaşan"        |
 * | `due`     | Saatinde → 30 dk sonrasına      | Toast + "ding" sesi, "Uygulama Zamanı"|
 * | `overdue` | 30 dk sonrası (veya `missed`)   | Kırmızı toast + ses, "Gecikmiş"       |
 */
export const PREPARE_LEAD_MINUTES = 15;
export const OVERDUE_AFTER_MINUTES = 30;

/**
 * Bildirim merkezinin iş listesi sorgusunun anahtarı. Bir dozun durumunu
 * değiştiren her mutasyon (kayıt, saat düzeltme, reçete iptali) bu sorguyu
 * geçersiz kılar; zil ve rozet bir sonraki periyodik çekimi beklemeden
 * güncellenir.
 */
export const WORKLIST_QUERY_KEY = ['schedule', 'mine'] as const;

const MINUTE_MS = 60_000;

export type DoseAlertTier = 'prepare' | 'due' | 'overdue';

/** `GET /schedule/mine` yanıtındaki tek bir doz; yalnızca bildirim merkezinin kullandığı alanlar. */
export interface WorklistDose {
  id: string;
  status: string;
  scheduledTime: string;
  patientName: string;
  roomNo: string | null;
  bedNo: string | null;
  patientWristbandCode: string;
  medicationName: string;
  dosage: string;
}

export interface DoseAlert {
  /** Doz + kademe; okunmadı takibinin ve tekrar bildirim engellemenin anahtarı. */
  key: string;
  tier: DoseAlertTier;
  dose: WorklistDose;
}

/** Açık bir dozun verilen andaki kademesi; kademe dışındaysa (henüz 15 dk'dan uzak veya kapanmış) `null`. */
export function alertTierAt(dose: WorklistDose, now: number): DoseAlertTier | null {
  if (!OPEN_DOSE_STATUSES.includes(dose.status)) return null;
  const diff = now - Date.parse(dose.scheduledTime);
  if (dose.status === 'missed' || diff >= OVERDUE_AFTER_MINUTES * MINUTE_MS) return 'overdue';
  if (diff >= 0) return 'due';
  if (-diff <= PREPARE_LEAD_MINUTES * MINUTE_MS) return 'prepare';
  return null;
}

const TIER_ORDER: Record<DoseAlertTier, number> = { overdue: 0, due: 1, prepare: 2 };

/** İş listesinden aktif uyarıları üretir; en kritik kademe ve en eski saat en üstte. */
export function buildAlerts(doses: WorklistDose[], now: number): DoseAlert[] {
  return doses
    .map((dose) => {
      const tier = alertTierAt(dose, now);
      return tier ? { key: `${dose.id}:${tier}`, tier, dose } : null;
    })
    .filter((a): a is DoseAlert => a !== null)
    .sort(
      (a, b) =>
        TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || Date.parse(a.dose.scheduledTime) - Date.parse(b.dose.scheduledTime),
    );
}
