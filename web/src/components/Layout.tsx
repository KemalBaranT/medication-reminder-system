import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const roleLabels: Record<string, string> = {
  doctor: 'Doktor',
  head_nurse: 'Bashemsire',
  nurse: 'Hemsire',
  secretary: 'Sekreter',
};

export function Layout() {
  const { user, logout } = useAuth();

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `block px-4 py-2 rounded-md text-sm font-medium ${
      isActive ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
    }`;

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r bg-white p-4 flex flex-col gap-2">
        <h1 className="text-lg font-bold mb-4 px-2">Ilac Takip</h1>
        <NavLink to="/" end className={linkClass}>
          Hastalar
        </NavLink>
        {(user?.role === 'head_nurse' || user?.role === 'doctor' || user?.role === 'secretary') && (
          <NavLink to="/reports" className={linkClass}>
            Raporlar
          </NavLink>
        )}
        {(user?.role === 'head_nurse' || user?.role === 'secretary') && (
          <NavLink to="/users" className={linkClass}>
            Kullanicilar
          </NavLink>
        )}
        <div className="mt-auto pt-4 border-t text-sm text-gray-500">
          <p className="mb-1">{user?.fullName}</p>
          <p className="mb-3">{user ? roleLabels[user.role] : ''}</p>
          <button onClick={logout} className="text-red-600 hover:underline">
            Cikis yap
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
