import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { onSessionExpired } from '../api/client';
import { api } from '../api/endpoints';
import type { AuthUser } from '../domain/types';
import { derivePermissions, type Permissions } from './permissions';
import { tokenStorage } from './tokenStorage';

type SessionStatus = 'restoring' | 'signedOut' | 'signedIn';

interface SessionContextValue {
  status: SessionStatus;
  user: AuthUser | null;
  permissions: Permissions;
  /** Müşteri hastanenin adı (beyaz etiketleme); başlıkta ve giriş ekranında gösterilir. */
  hospitalName: string;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Uygulamanın oturum durumunun sahibi.
 *
 * Hastane adı da burada tutulur: kimlik doğrulaması gerektirmeyen
 * `GET /settings` ile açılışta bir kez okunur ve giriş ekranından ana
 * başlığa kadar her yerde aynı değer kullanılır.
 *
 * Açılışta cihazdaki güvenli depodan önceki oturumu geri yükler; bu
 * sırada durum `restoring` kalır ve yönlendirme kararı verilmez, böylece
 * oturumu açık bir kullanıcı bir anlığına giriş ekranını görmez. API
 * katmanı sessiz token yenilemesinin de başarısız olduğunu bildirdiğinde
 * oturumu yerel olarak kapatır ve kullanıcıyı giriş ekranına düşürür.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('restoring');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hospitalName, setHospitalName] = useState('İlaç Takip Sistemi');

  useEffect(() => {
    api
      .hospitalName()
      .then(setHospitalName)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [token, storedUser] = await Promise.all([tokenStorage.getAccessToken(), tokenStorage.getUser()]);
      if (cancelled) return;
      if (token && storedUser) {
        setUser(storedUser);
        setStatus('signedIn');
      } else {
        setStatus('signedOut');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    onSessionExpired(() => {
      void tokenStorage.clear();
      setUser(null);
      setStatus('signedOut');
    });
    return () => onSessionExpired(null);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const session = await api.login(email.trim().toLowerCase(), password);
    await tokenStorage.saveTokens(session.accessToken, session.refreshToken);
    await tokenStorage.saveUser(session.user);
    setUser(session.user);
    setStatus('signedIn');
  }, []);

  const signOut = useCallback(async () => {
    const refreshToken = await tokenStorage.getRefreshToken();
    if (refreshToken) {
      try {
        await api.logout(refreshToken);
      } catch {
        // Sunucuya ulaşılamasa da cihazdaki oturum kapatılır; refresh token
        // kendi süresi dolduğunda sunucuda da geçersiz hale gelir.
      }
    }
    await tokenStorage.clear();
    setUser(null);
    setStatus('signedOut');
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ status, user, permissions: derivePermissions(user), hospitalName, signIn, signOut }),
    [status, user, hospitalName, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession, SessionProvider içinde kullanılmalıdır.');
  return ctx;
}
