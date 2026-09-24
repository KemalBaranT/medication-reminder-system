import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { hasAnyRole } from '../lib/roles';

/**
 * App.tsx'te bir yerleşim rotası olarak kullanılan rota koruyucusu.
 * `allowedRoles` olmadan yalnızca birinin oturum açtığını kontrol eder;
 * altına `allowedRoles` ile ikinci bir örnek yerleştirmek (/reports ve
 * /users rotalarına bakın), giriş kontrolünü tekrarlamadan bir sayfa alt
 * kümesi için erişimi daha da daraltır. Yetkisiz ama kimliği doğrulanmış
 * bir kullanıcı bir hata sayfası yerine "/"e gönderilir, çünkü sadece
 * role uygun bir varış sayfası olmayabilir. Kontrol [hasAnyRole]
 * üzerinden yapıldığı için Super Admin hiçbir rotadan yönlendirilmez.
 */
export function ProtectedRoute({ allowedRoles }: { allowedRoles?: string[] }) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !hasAnyRole(user, allowedRoles)) return <Navigate to="/" replace />;

  return <Outlet />;
}
