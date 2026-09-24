import { createContext, useContext, useState, type ReactNode } from 'react';
import { api } from '../lib/api';

interface AuthUser {
  id: string;
  fullName: string;
  title?: string | null;
  email: string;
  role: 'admin' | 'doctor' | 'head_nurse' | 'nurse' | 'secretary';
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Tum uygulama icin oturum acmis kullanicinin oturumuna sahiptir. JWT ve
 * kullanici profili yalnizca React durumuna degil localStorage'a da
 * yansitilir; boylece bir sayfa yenilemesi yeniden girisi zorunlu kilmaz.
 * `api.ts`'nin istek interceptor'i, token'i ayni depolama anahtarindan
 * bagimsiz olarak okur.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem('authUser');
    return raw ? JSON.parse(raw) : null;
  });

  async function login(email: string, password: string) {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('authUser', JSON.stringify(data.user));
    setUser(data.user);
  }

  function logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('authUser');
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth, AuthProvider icinde kullanilmalidir');
  return ctx;
}
