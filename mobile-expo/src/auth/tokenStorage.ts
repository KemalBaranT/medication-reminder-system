import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { AuthUser } from '../domain/types';

/**
 * iOS Keychain erişilebilirlik sınıfı. Varsayılan (`WHEN_UNLOCKED`) ile
 * saklanan token'lar cihaz kilitliyken okunamaz; bu da kilit ekranındaki
 * bir telefonda çalışan arka plan bildirim senkronunun (bkz.
 * `notifications/backgroundSync.ts`) sunucuya erişememesine yol açardı.
 * `AFTER_FIRST_UNLOCK`, cihaz yeniden başlatıldıktan sonraki ilk kilit
 * açılışından itibaren arka planda okumaya izin verir; token'lar yine
 * şifreli ve cihaza bağlı kalır.
 */
const SECURE_OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

const KEYS = {
  accessToken: 'ilactakip.accessToken',
  refreshToken: 'ilactakip.refreshToken',
  user: 'ilactakip.user',
} as const;

/**
 * Oturum sırlarının kalıcı deposu.
 *
 * **Neden SecureStore:** Access ve refresh token, bir hastanın ilaç
 * kaydını değiştirme yetkisi taşır. iOS Keychain / Android Keystore
 * üzerinde şifreli saklanırlar; cihaz yedeğinden veya dosya sisteminden
 * düz metin olarak okunamazlar.
 *
 * Web önizlemesinde SecureStore bulunmadığından yalnızca geliştirme
 * kolaylığı için `localStorage` kullanılır; web, bu uygulamanın klinik
 * kullanım hedefi değildir.
 */
const storage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key, SECURE_OPTIONS);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        return;
      }
      return;
    }
    await SecureStore.setItemAsync(key, value, SECURE_OPTIONS);
  },
  async remove(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.removeItem(key);
      } catch {
        return;
      }
      return;
    }
    await SecureStore.deleteItemAsync(key, SECURE_OPTIONS);
  },
};

export const tokenStorage = {
  getAccessToken: () => storage.get(KEYS.accessToken),
  getRefreshToken: () => storage.get(KEYS.refreshToken),

  async getUser(): Promise<AuthUser | null> {
    const raw = await storage.get(KEYS.user);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  },

  async saveTokens(accessToken: string, refreshToken: string): Promise<void> {
    await storage.set(KEYS.accessToken, accessToken);
    await storage.set(KEYS.refreshToken, refreshToken);
  },

  async saveUser(user: AuthUser): Promise<void> {
    await storage.set(KEYS.user, JSON.stringify(user));
  },

  async clear(): Promise<void> {
    await Promise.all([
      storage.remove(KEYS.accessToken),
      storage.remove(KEYS.refreshToken),
      storage.remove(KEYS.user),
    ]);
  },
};
