import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface UserRow {
  id: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
}

const roleLabels: Record<string, string> = {
  doctor: 'Doktor',
  head_nurse: 'Bashemsire',
  nurse: 'Hemsire',
  secretary: 'Sekreter',
};

export function UsersPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', role: 'nurse' });

  const { data: users, isLoading } = useQuery<UserRow[]>({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data,
  });

  const createUser = useMutation({
    mutationFn: async () => (await api.post('/users', form)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setForm({ fullName: '', email: '', password: '', role: 'nurse' });
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createUser.mutate();
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Kullanicilar</h2>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm p-4 mb-6 grid grid-cols-2 gap-3 max-w-xl">
        <input
          placeholder="Ad Soyad"
          required
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          className="border rounded-md px-3 py-2"
        />
        <input
          type="email"
          placeholder="E-posta"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="border rounded-md px-3 py-2"
        />
        <input
          type="password"
          placeholder="Sifre (en az 6 karakter)"
          required
          minLength={6}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="border rounded-md px-3 py-2"
        />
        <select
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
          className="border rounded-md px-3 py-2"
        >
          <option value="nurse">Hemsire</option>
          <option value="doctor">Doktor</option>
          <option value="head_nurse">Bashemsire</option>
          <option value="secretary">Sekreter</option>
        </select>
        <button
          type="submit"
          disabled={createUser.isPending}
          className="col-span-2 bg-blue-600 text-white rounded-md py-2 font-medium disabled:opacity-50"
        >
          Kullanici Ekle
        </button>
      </form>

      {isLoading ? (
        <p>Yukleniyor...</p>
      ) : (
        <table className="w-full text-sm text-left bg-white rounded-lg shadow-sm overflow-hidden">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-2">Ad Soyad</th>
              <th className="px-4 py-2">E-posta</th>
              <th className="px-4 py-2">Rol</th>
              <th className="px-4 py-2">Durum</th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="px-4 py-2">{u.fullName}</td>
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2">{roleLabels[u.role] ?? u.role}</td>
                <td className="px-4 py-2">{u.isActive ? 'Aktif' : 'Pasif'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
