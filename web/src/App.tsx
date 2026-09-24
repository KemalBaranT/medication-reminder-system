import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { ToastViewport } from './components/ui/ToastViewport';
import { LoginPage } from './pages/LoginPage';
import { PatientsPage } from './pages/PatientsPage';
import { PatientDetailPage } from './pages/PatientDetailPage';
import { ReportsPage } from './pages/ReportsPage';
import { UsersPage } from './pages/UsersPage';

const queryClient = new QueryClient();

/**
 * Hastane admin paneli icin rota agaci. Yetkilendirme katmanlidir: dis
 * ProtectedRoute herhangi bir oturum acilmis oturum gerektirir, ic ice
 * gecmis ProtectedRoute ornekleri ise (Raporlar, Personel Yonetimi) sayfa
 * basina rol kontrolleri ekler ve bunlar backend controller'indaki ilgili
 * @Roles() guard'iyla senkron tutulmalidir.
 */
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/" element={<PatientsPage />} />
                <Route path="/patients/:patientId" element={<PatientDetailPage />} />
                <Route element={<ProtectedRoute allowedRoles={['admin', 'head_nurse', 'doctor', 'secretary']} />}>
                  <Route path="/reports" element={<ReportsPage />} />
                </Route>
                <Route element={<ProtectedRoute allowedRoles={['admin', 'head_nurse']} />}>
                  <Route path="/users" element={<UsersPage />} />
                </Route>
              </Route>
            </Route>
          </Routes>
          <ToastViewport />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
