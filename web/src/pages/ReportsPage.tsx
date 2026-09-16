import { useQuery } from '@tanstack/react-query';
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

export function ReportsPage() {
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
      <h2 className="text-xl font-bold">Raporlar</h2>

      <section className="bg-white rounded-lg shadow-sm p-4">
        <h3 className="font-semibold mb-3">Doz Durumu Ozeti</h3>
        <div className="flex gap-4 flex-wrap">
          {statusSummary?.map((s) => (
            <div key={s.status} className="border rounded-md px-4 py-2 min-w-32 text-center">
              <p className="text-2xl font-bold">{s.count}</p>
              <p className="text-xs text-gray-500">{s.status}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-lg shadow-sm p-4">
        <h3 className="font-semibold mb-3">Zamanlilik (uygulanan dozlar arasinda)</h3>
        {timeliness && (
          <div className="flex gap-4">
            <div className="border rounded-md px-4 py-2 min-w-32 text-center">
              <p className="text-2xl font-bold text-green-600">{timeliness.onTime}</p>
              <p className="text-xs text-gray-500">Zamaninda</p>
            </div>
            <div className="border rounded-md px-4 py-2 min-w-32 text-center">
              <p className="text-2xl font-bold text-amber-600">{timeliness.delayed}</p>
              <p className="text-xs text-gray-500">Gecikmeli</p>
            </div>
            <div className="border rounded-md px-4 py-2 min-w-32 text-center">
              <p className="text-2xl font-bold">{timeliness.total}</p>
              <p className="text-xs text-gray-500">Toplam</p>
            </div>
          </div>
        )}
      </section>

      <section className="bg-white rounded-lg shadow-sm p-4">
        <h3 className="font-semibold mb-3">Hemsire Bazinda</h3>
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2">Hemsire</th>
              <th className="px-3 py-2">Uygulanan</th>
              <th className="px-3 py-2">Uygulanmayan</th>
            </tr>
          </thead>
          <tbody>
            {byNurse?.map((n) => (
              <tr key={n.nurseId} className="border-t">
                <td className="px-3 py-2">{n.fullName}</td>
                <td className="px-3 py-2">{n.administered}</td>
                <td className="px-3 py-2">{n.notAdministered}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
