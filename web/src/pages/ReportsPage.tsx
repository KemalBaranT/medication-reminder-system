import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';

interface StatusCount {
  status: string;
  count: number;
}

interface Timeliness {
  onTime: number;
  delayed: number;
  total: number;
}

interface NurseStat {
  nurseId: string;
  fullName: string;
  administered: number;
  notAdministered: number;
}

function StatTile({ value, label, accent = 'text-slate-900' }: { value: number; label: string; accent?: string }) {
  return (
    <div className="border border-slate-100 rounded-xl px-5 py-3 min-w-32 text-center bg-slate-50/50 transition-colors hover:bg-slate-50">
      <p className={`text-2xl font-bold ${accent}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

/** Doz uyumlulugu, zamanindalik ve hemsire basina is yukunu toplulastiran yonetime yonelik pano; salt-okunur, mutasyon yok. */
export function ReportsPage() {
  const { t } = useTranslation();

  const { data: statusSummary } = useQuery<StatusCount[]>({
    queryKey: ['reports', 'status-summary'],
    queryFn: async () => (await api.get('/reports/status-summary')).data,
  });

  const { data: timeliness } = useQuery<Timeliness>({
    queryKey: ['reports', 'timeliness'],
    queryFn: async () => (await api.get('/reports/timeliness')).data,
  });

  const { data: byNurse } = useQuery<NurseStat[]>({
    queryKey: ['reports', 'by-nurse'],
    queryFn: async () => (await api.get('/reports/by-nurse')).data,
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t('reports.title')}</h2>
        <p className="text-sm text-slate-500 mt-1">{t('reports.subtitle')}</p>
      </div>

      <section className="card p-5">
        <h3 className="font-semibold text-slate-800 mb-4">{t('reports.statusSummaryTitle')}</h3>
        <div className="flex gap-3 flex-wrap">
          {statusSummary?.map((s) => (
            <StatTile key={s.status} value={s.count} label={t(`prescriptions.scheduleStatus${capitalize(s.status)}`)} />
          ))}
        </div>
      </section>

      <section className="card p-5">
        <h3 className="font-semibold text-slate-800 mb-4">{t('reports.timelinessTitle')}</h3>
        {timeliness && (
          <div className="flex gap-3 flex-wrap">
            <StatTile value={timeliness.onTime} label={t('reports.onTime')} accent="text-emerald-600" />
            <StatTile value={timeliness.delayed} label={t('reports.delayed')} accent="text-amber-600" />
            <StatTile value={timeliness.total} label={t('reports.total')} />
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        <h3 className="font-semibold text-slate-800 px-5 pt-5 pb-3">{t('reports.byNurseTitle')}</h3>
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-5 py-3 font-medium">{t('reports.nurse')}</th>
              <th className="px-5 py-3 font-medium">{t('reports.administered')}</th>
              <th className="px-5 py-3 font-medium">{t('reports.notAdministered')}</th>
            </tr>
          </thead>
          <tbody>
            {byNurse?.map((n) => (
              <tr key={n.nurseId} className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
                <td className="px-5 py-3 font-medium text-slate-800">{n.fullName}</td>
                <td className="px-5 py-3 text-emerald-700">{n.administered}</td>
                <td className="px-5 py-3 text-red-600">{n.notAdministered}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
