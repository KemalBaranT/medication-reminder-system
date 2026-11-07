import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../auth/AuthContext';
import { useNow } from '../hooks/useNow';
import { api } from '../lib/api';
import { buildAlerts, WORKLIST_QUERY_KEY, type WorklistDose } from '../lib/doseAlerts';
import { playNotificationSound, primeNotificationSound } from '../lib/notificationSound';
import { hasAnyRole } from '../lib/roles';
import { DoseAlertsContext, type DoseAlertsContextValue } from './doseAlertsContext';

/**
 * `GET /schedule/mine` uç noktasına erişebilen roller (backend
 * `ScheduleController.mine` guard'ıyla aynı). Sekreter ilaç iş listesini
 * görmez; bildirim merkezi onun için gösterilmez.
 */
const ALERT_ROLES = ['nurse', 'doctor', 'head_nurse'] as const;

/**
 * Sunucudan iş listesinin yeniden çekilme aralığı. Kademe geçişleri
 * (hazırlık → zamanı → gecikme) sunucuyu beklemeden {@link TICK_MS}
 * aralığıyla istemci saatine göre hesaplanır; periyodik çekim yalnızca
 * yeni dozları, başka cihazdan yapılan kayıtları ve atama değişikliklerini
 * yakalamak içindir.
 */
const POLL_MS = 30_000;
const TICK_MS = 15_000;

/** Tek seferde tek tek gösterilecek en fazla toast; fazlası tek bir özet toast'ta toplanır. */
const MAX_INDIVIDUAL_TOASTS = 3;

function seenStorageKey(userId: string) {
  return `doseAlerts.seen.${userId}`;
}

function readSeen(userId: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(seenStorageKey(userId)) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

/**
 * Web panelinin kademeli bildirim merkezi: sağ üstteki zil, okunmamış
 * sayacı, açılır liste ve saat geldiğinde çıkan toast + ses.
 *
 * ## Senkronizasyon
 * Panel, mobil istemciyle aynı veri kaynağını (`GET /schedule/mine`) ve
 * aynı kademe eşiklerini (`lib/doseAlerts.ts`) kullanır; bir doz mobilde
 * "Uygulama Zamanı" bildirimi verdiği anda panelde de toast çıkar. Bir
 * doz herhangi bir cihazdan kaydedildiğinde, en geç bir sonraki çekimde
 * ({@link POLL_MS}) uyarı panelden de kalkar; panelden yapılan kayıtlar
 * ise sorguyu anında geçersiz kılar.
 *
 * ## Toast ve ses kuralları
 * - Bir uyarı anahtarı (doz + kademe) bu oturumda yalnızca bir kez toast
 *   olarak gösterilir.
 * - Sayfa ilk açıldığında zaten aktif olan uyarılar tek tek değil, tek bir
 *   özet toast ile bildirilir; yeniden yüklemede ekran toast'a boğulmaz.
 * - "Hazırlık" kademesi toast üretmez, yalnızca listede görünür.
 * - Ses yalnızca "Uygulama Zamanı" ve "Gecikme" kademelerinde çalar.
 *
 * ## Okunmadı takibi
 * Okunmuş uyarı anahtarları kullanıcı başına `localStorage`'da tutulur ve
 * yalnızca hâlâ aktif olanlarla sınırlanır. Okunmadı bilgisi kişisel bir
 * görünüm tercihidir; klinik bir kayıt değildir ve bu yüzden sunucuda
 * saklanmaz. Sağlayıcı kullanıcı kimliğiyle anahtarlanarak kurulur (bkz.
 * `Layout`); aynı tarayıcıda başka bir personel oturum açtığında durum
 * sıfırdan, o kişinin kayıtlarıyla başlar.
 */
export function DoseAlertsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const enabled = hasAnyRole(user, ALERT_ROLES);
  const now = useNow(TICK_MS).getTime();

  const { data, isLoading } = useQuery({
    queryKey: WORKLIST_QUERY_KEY,
    queryFn: async () => (await api.get<WorklistDose[]>('/schedule/mine')).data,
    enabled,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
  });

  const alerts = useMemo(() => (enabled && data ? buildAlerts(data, now) : []), [enabled, data, now]);

  const [seen, setSeen] = useState<Set<string>>(() => (user ? readSeen(user.id) : new Set()));

  const unreadCount = alerts.filter((a) => !seen.has(a.key)).length;

  const markAllRead = useCallback(() => {
    if (!user) return;
    const next = new Set(alerts.map((a) => a.key));
    setSeen(next);
    try {
      localStorage.setItem(seenStorageKey(user.id), JSON.stringify([...next]));
    } catch {
      // Depolama kullanılamıyor (gizli pencere); okunmadı durumu yalnızca bu oturumda tutulur.
    }
  }, [alerts, user]);

  const openPatient = useCallback(
    async (wristbandCode: string) => {
      try {
        const { data: patient } = await api.get<{ id: string }>(`/patients/wristband/${encodeURIComponent(wristbandCode)}`);
        navigate(`/patients/${patient.id}`);
      } catch {
        toast.error(t('alerts.patientNotFound'));
      }
    },
    [navigate, t],
  );

  useEffect(() => primeNotificationSound(), []);

  const announced = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!enabled || !data) return;
    const loud = alerts.filter((a) => a.tier !== 'prepare');

    if (announced.current === null) {
      announced.current = new Set(alerts.map((a) => a.key));
      if (loud.length > 0) {
        const overdue = loud.filter((a) => a.tier === 'overdue').length;
        toast(t('alerts.summaryTitle', { count: loud.length }), {
          description: overdue > 0 ? t('alerts.summaryOverdue', { count: overdue }) : t('alerts.summaryDue'),
          className: overdue > 0 ? 'toast-overdue' : 'toast-due',
        });
      }
      return;
    }

    const fresh = loud.filter((a) => !announced.current!.has(a.key));
    alerts.forEach((a) => announced.current!.add(a.key));
    if (fresh.length === 0) return;

    playNotificationSound(fresh.some((a) => a.tier === 'overdue'));
    fresh.slice(0, MAX_INDIVIDUAL_TOASTS).forEach((alert) => {
      const time = new Date(alert.dose.scheduledTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      const overdue = alert.tier === 'overdue';
      toast(overdue ? t('alerts.overdueTitle', { medication: alert.dose.medicationName }) : t('alerts.dueTitle', { medication: alert.dose.medicationName }), {
        description: t('alerts.toastBody', { patient: alert.dose.patientName, dosage: alert.dose.dosage, time }),
        className: overdue ? 'toast-overdue' : 'toast-due',
        duration: overdue ? 15_000 : 8_000,
        action: { label: t('alerts.openPatient'), onClick: () => void openPatient(alert.dose.patientWristbandCode) },
      });
    });
    if (fresh.length > MAX_INDIVIDUAL_TOASTS) {
      toast(t('alerts.moreTitle', { count: fresh.length - MAX_INDIVIDUAL_TOASTS }), { className: 'toast-due' });
    }
  }, [alerts, data, enabled, openPatient, t]);

  const value = useMemo<DoseAlertsContextValue>(
    () => ({ enabled, alerts, unreadCount, markAllRead, openPatient: (code) => void openPatient(code), isLoading }),
    [enabled, alerts, unreadCount, markAllRead, openPatient, isLoading],
  );

  return <DoseAlertsContext.Provider value={value}>{children}</DoseAlertsContext.Provider>;
}
