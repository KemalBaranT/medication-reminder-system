import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { ApiError, errorMessage } from '../api/client';
import { api } from '../api/endpoints';
import { useSession } from '../auth/SessionProvider';
import type { ScheduleItem } from '../domain/types';
import { buildPatientWorklist, CONFIRMATION_HOLD_MS, type PatientWorkItem } from '../domain/worklist';

interface AdministerOptions {
  /** Hasta bilekliği ve ilaç barkodu yatak başında canlı kamerayla okundu. */
  barcodeVerified: boolean;
}

interface ScheduleContextValue {
  items: ScheduleItem[];
  worklist: PatientWorkItem[];
  /** İş listesinin hesaplandığı an; kartların saat metinleri aynı saatle çizilir. */
  now: number;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  findDose: (scheduleId: string) => ScheduleItem | undefined;
  /**
   * Dozu "Verildi" olarak kaydeder ve kartı sunucu yanıtıyla anında
   * günceller. Hata durumunda `ApiError` fırlatır; çağıran ekran mesajı
   * gösterir.
   */
  administer: (scheduleId: string, options: AdministerOptions) => Promise<void>;
}

const ScheduleContext = createContext<ScheduleContextValue | null>(null);

/**
 * Ana ekranı yeniden hesaplamak için kullanılan saat adımı. Kartların
 * "Bekliyor → Saati Geldi → Gecikmiş" geçişi sunucudan yeni veri gelmesini
 * beklemeden, yalnızca zamanın ilerlemesiyle gerçekleşmelidir.
 */
const CLOCK_TICK_MS = 30_000;

/** Uygulama ön plandayken iş listesinin sunucudan yeniden çekilme aralığı. */
const POLL_INTERVAL_MS = 60_000;

/**
 * "Bugünün İlaçları" iş listesinin tek sahibi.
 *
 * Ana ekran, zaman çizelgesi ve QR tarayıcı aynı doz nesnelerini paylaşır;
 * bir ekrandan yapılan kayıt diğerlerine yeniden istek atmadan anında
 * yansır. Liste; oturum açıldığında, uygulama ön plana döndüğünde ve
 * belirli aralıklarla sunucudan tazelenir, çünkü aynı dozu başka bir
 * hemşire başka bir cihazdan kapatmış olabilir.
 */
export function ScheduleProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [recentlyConfirmed, setRecentlyConfirmed] = useState<ReadonlyMap<string, number>>(new Map());
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const load = useCallback(async (mode: 'initial' | 'pull' | 'silent') => {
    if (mode === 'pull') setRefreshing(true);
    try {
      const data = await api.mySchedule();
      setItems(data);
      setError(null);
    } catch (e) {
      if (!(e instanceof ApiError && e.isSessionExpired)) setError(errorMessage(e));
    } finally {
      setNow(Date.now());
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (status !== 'signedIn') {
      setItems([]);
      setLoading(true);
      return;
    }
    void load('initial');
    const poll = setInterval(() => void load('silent'), POLL_INTERVAL_MS);
    const clock = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load('silent');
    });
    return () => {
      clearInterval(poll);
      clearInterval(clock);
      sub.remove();
    };
  }, [status, load]);

  const administer = useCallback(async (scheduleId: string, { barcodeVerified }: AdministerOptions) => {
    const performedAt = new Date().toISOString();
    try {
      const result = await api.administer({ scheduleId, action: 'administered', barcodeVerified, performedAt });
      setItems((prev) =>
        prev.map((item) =>
          item.id === scheduleId
            ? {
                ...item,
                status: result.scheduleStatus,
                administeredAt: result.performedAt,
                administeredByName: result.performedByName,
              }
            : item,
        ),
      );
    } catch (e) {
      if (e instanceof ApiError && e.isConflict) {
        // Doz başka bir cihazdan zaten kapatılmış: listeyi sunucuyla
        // eşitleyip hatayı yine de bildiririz ki hemşire çift uygulama
        // riskini fark etsin.
        void load('silent');
      }
      throw e;
    }

    const confirmedAt = Date.now();
    setNow(confirmedAt);
    setRecentlyConfirmed((prev) => new Map(prev).set(scheduleId, confirmedAt));
    setTimeout(() => {
      setRecentlyConfirmed((prev) => {
        const next = new Map(prev);
        next.delete(scheduleId);
        return next;
      });
      setNow(Date.now());
    }, CONFIRMATION_HOLD_MS + 50);
  }, [load]);

  const worklist = useMemo(() => buildPatientWorklist(items, now, recentlyConfirmed), [items, now, recentlyConfirmed]);

  const value = useMemo<ScheduleContextValue>(
    () => ({
      items,
      worklist,
      now,
      loading,
      refreshing,
      error,
      refresh: () => load('pull'),
      findDose: (id) => itemsRef.current.find((i) => i.id === id),
      administer,
    }),
    [items, worklist, now, loading, refreshing, error, load, administer],
  );

  return <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>;
}

export function useSchedule(): ScheduleContextValue {
  const ctx = useContext(ScheduleContext);
  if (!ctx) throw new Error('useSchedule, ScheduleProvider içinde kullanılmalıdır.');
  return ctx;
}
