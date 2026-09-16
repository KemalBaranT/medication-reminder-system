import { type FormEvent, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';

interface Medication {
  id: string;
  name: string;
  unit?: string;
}

interface ScheduleItem {
  id: string;
  scheduledTime: string;
  status: string;
}

interface Prescription {
  id: string;
  dosage: string;
  route?: string;
  frequencyHours: number;
  status: string;
  medication: Medication;
  schedules: ScheduleItem[];
}

const statusLabels: Record<string, string> = {
  pending: 'Bekliyor',
  notified: 'Bildirim gonderildi',
  administered: 'Uygulandi',
  missed: 'Kacirildi',
  skipped: 'Atlandi',
};

export function PatientDetailPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    medicationId: '',
    dosage: '',
    route: '',
    frequencyHours: 8,
    startAt: '',
  });

  const { data: prescriptions, isLoading } = useQuery<Prescription[]>({
    queryKey: ['prescriptions', patientId],
    queryFn: async () => (await api.get(`/prescriptions/patient/${patientId}`)).data,
  });

  const { data: medications } = useQuery<Medication[]>({
    queryKey: ['medications'],
    queryFn: async () => (await api.get('/medications')).data,
    enabled: user?.role === 'doctor',
  });

  const createPrescription = useMutation({
    mutationFn: async () =>
      (
        await api.post('/prescriptions', {
          ...form,
          patientId,
          startAt: new Date(form.startAt).toISOString(),
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prescriptions', patientId] });
      setForm({ medicationId: '', dosage: '', route: '', frequencyHours: 8, startAt: '' });
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createPrescription.mutate();
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Hasta Recete Gecmisi</h2>

      {user?.role === 'doctor' && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm p-4 mb-6 grid grid-cols-2 gap-3 max-w-xl">
          <select
            required
            value={form.medicationId}
            onChange={(e) => setForm({ ...form, medicationId: e.target.value })}
            className="border rounded-md px-3 py-2 col-span-2"
          >
            <option value="">Ilac secin</option>
            {medications?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <input
            placeholder="Doz (orn. 500mg)"
            required
            value={form.dosage}
            onChange={(e) => setForm({ ...form, dosage: e.target.value })}
            className="border rounded-md px-3 py-2"
          />
          <input
            placeholder="Uygulama yolu (oral, IV...)"
            value={form.route}
            onChange={(e) => setForm({ ...form, route: e.target.value })}
            className="border rounded-md px-3 py-2"
          />
          <input
            type="number"
            min={1}
            placeholder="Kac saatte bir"
            required
            value={form.frequencyHours}
            onChange={(e) => setForm({ ...form, frequencyHours: Number(e.target.value) })}
            className="border rounded-md px-3 py-2"
          />
          <input
            type="datetime-local"
            required
            value={form.startAt}
            onChange={(e) => setForm({ ...form, startAt: e.target.value })}
            className="border rounded-md px-3 py-2"
          />
          <button
            type="submit"
            disabled={createPrescription.isPending}
            className="col-span-2 bg-blue-600 text-white rounded-md py-2 font-medium disabled:opacity-50"
          >
            Recete Ekle
          </button>
        </form>
      )}

      {isLoading ? (
        <p>Yukleniyor...</p>
      ) : (
        <div className="space-y-4">
          {prescriptions?.map((p) => (
            <div key={p.id} className="bg-white rounded-lg shadow-sm p-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold">
                  {p.medication.name} - {p.dosage} ({p.frequencyHours} saatte bir)
                </h3>
                <span className="text-xs px-2 py-1 rounded-full bg-gray-100">{p.status}</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-1">Planlanan Zaman</th>
                    <th className="py-1">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {p.schedules.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="py-1">{new Date(s.scheduledTime).toLocaleString('tr-TR')}</td>
                      <td className="py-1">{statusLabels[s.status] ?? s.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
