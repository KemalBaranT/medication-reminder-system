import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Patient {
  id: string;
  hospitalPatientNo: string;
  fullName: string;
  roomNo?: string;
  bedNo?: string;
  wristbandCode: string;
  status: string;
}

export function PatientsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    hospitalPatientNo: '',
    fullName: '',
    roomNo: '',
    bedNo: '',
    wristbandCode: '',
  });

  const { data: patients, isLoading } = useQuery<Patient[]>({
    queryKey: ['patients'],
    queryFn: async () => (await api.get('/patients')).data,
  });

  const createPatient = useMutation({
    mutationFn: async () => (await api.post('/patients', form)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      setForm({ hospitalPatientNo: '', fullName: '', roomNo: '', bedNo: '', wristbandCode: '' });
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createPatient.mutate();
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Hastalar</h2>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm p-4 mb-6 grid grid-cols-2 gap-3 max-w-xl">
        <input
          placeholder="Protokol No"
          required
          value={form.hospitalPatientNo}
          onChange={(e) => setForm({ ...form, hospitalPatientNo: e.target.value })}
          className="border rounded-md px-3 py-2"
        />
        <input
          placeholder="Ad Soyad"
          required
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          className="border rounded-md px-3 py-2"
        />
        <input
          placeholder="Oda No"
          value={form.roomNo}
          onChange={(e) => setForm({ ...form, roomNo: e.target.value })}
          className="border rounded-md px-3 py-2"
        />
        <input
          placeholder="Yatak No"
          value={form.bedNo}
          onChange={(e) => setForm({ ...form, bedNo: e.target.value })}
          className="border rounded-md px-3 py-2"
        />
        <input
          placeholder="Bileklik Kodu (QR)"
          required
          value={form.wristbandCode}
          onChange={(e) => setForm({ ...form, wristbandCode: e.target.value })}
          className="border rounded-md px-3 py-2 col-span-2"
        />
        <button
          type="submit"
          disabled={createPatient.isPending}
          className="col-span-2 bg-blue-600 text-white rounded-md py-2 font-medium disabled:opacity-50"
        >
          Hasta Ekle
        </button>
      </form>

      {isLoading ? (
        <p>Yukleniyor...</p>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-2">Protokol No</th>
                <th className="px-4 py-2">Ad Soyad</th>
                <th className="px-4 py-2">Oda/Yatak</th>
                <th className="px-4 py-2">Durum</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {patients?.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-2">{p.hospitalPatientNo}</td>
                  <td className="px-4 py-2">{p.fullName}</td>
                  <td className="px-4 py-2">
                    {p.roomNo ?? '-'} / {p.bedNo ?? '-'}
                  </td>
                  <td className="px-4 py-2">{p.status}</td>
                  <td className="px-4 py-2">
                    <Link to={`/patients/${p.id}`} className="text-blue-600 hover:underline">
                      Detay
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
