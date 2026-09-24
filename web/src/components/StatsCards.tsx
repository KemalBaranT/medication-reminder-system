import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';

interface DashboardSummary {
  activePatients: number;
  overdueDoses: number;
  todayDosesTotal: number;
  administeredToday: number;
}

type Accent = 'brand' | 'critical' | 'neutral' | 'good';

const ACCENT_CLASSES: Record<Accent, { icon: string; value: string }> = {
  brand: { icon: 'bg-brand-50 text-brand-600', value: 'text-slate-900' },
  critical: { icon: 'bg-red-50 text-red-600', value: 'text-red-600' },
  neutral: { icon: 'bg-slate-100 text-slate-600', value: 'text-slate-900' },
  good: { icon: 'bg-emerald-50 text-emerald-600', value: 'text-slate-900' },
};

const ICONS: Record<string, ReactNode> = {
  patients: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="10" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  alert: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  ),
  calendar: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  ),
  check: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m9 11 3 3L22 4" />
    </svg>
  ),
};

/**
 * Tek bakista goruntulenen tek bir sayi. Kasitli olarak minimal tutulmustur
 * - etiket, ikon, deger - degisim/sparkline olmadan: backend'in ozeti
 * henuz kayitli bir tarihsel referansi olmayan canli bir anlik goruntudur,
 * bu yuzden uydurma bir egilim hicbirinden daha kotu olurdu. `value`,
 * fontun varsayilan oransal rakamlarini kullanir (tabular-nums degil); bu,
 * hizalanmis bir tablo sutunu yerine bagimsiz, one cikan bir sayi icin
 * dogrudur.
 */
function StatCard({ label, value, icon, accent }: { label: string; value: number; icon: ReactNode; accent: Accent }) {
  const classes = ACCENT_CLASSES[accent];
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${classes.icon}`}>{icon}</div>
      <div className="min-w-0">
        <p className={`text-2xl font-semibold leading-tight ${classes.value}`}>{value}</p>
        <p className="text-xs text-slate-500 mt-0.5 truncate">{label}</p>
      </div>
    </div>
  );
}

/**
 * Panelin ana sayfasinin ustunde gosterilen servis durumu ozeti. Yonetime
 * ozel `/reports/*` uc noktalari yerine kasitli olarak kendi hafif
 * `/dashboard/summary` uc noktasina dayanir (bkz. backend
 * DashboardController); boylece hemsireler dahil kimlik dogrulanmis her
 * rol, uygulamaya girdigi anda ayni tek-bakis sayilarini alir, sadece
 * raporlarin sinirlandigi denetim rolleri degil. Hata sessizdir (hata
 * banner'i yoktur): ozet yuklenemezse sayfa yine calisir, sadece kart
 * gostermez, cunku bu bir kolaylik goruntusudur, sayfanin ana verisi
 * degildir.
 */
export function StatsCards() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery<DashboardSummary>({
    queryKey: ['dashboard', 'summary'],
    queryFn: async () => (await api.get('/dashboard/summary')).data,
    refetchInterval: 60_000,
  });

  if (isLoading || !data) return null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <StatCard label={t('dashboard.activePatients')} value={data.activePatients} icon={ICONS.patients} accent="brand" />
      <StatCard label={t('dashboard.overdueDoses')} value={data.overdueDoses} icon={ICONS.alert} accent={data.overdueDoses > 0 ? 'critical' : 'good'} />
      <StatCard label={t('dashboard.todayDosesTotal')} value={data.todayDosesTotal} icon={ICONS.calendar} accent="neutral" />
      <StatCard label={t('dashboard.administeredToday')} value={data.administeredToday} icon={ICONS.check} accent="good" />
    </div>
  );
}
