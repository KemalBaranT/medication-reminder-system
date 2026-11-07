import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Backend'in (NestJS) varsayılan dinleme portu; bkz. `backend/src/main.ts`. */
const BACKEND_PORT = 3000;

/**
 * Backend'in kök adresini çözer.
 *
 * **Çözümleme sırası ve nedeni:**
 * 1. `EXPO_PUBLIC_API_URL` ortam değişkeni: Test, hazırlık ve canlı
 *    ortamlarda hastane iç ağındaki sabit sunucu adresi buradan verilir.
 * 2. Expo geliştirme sunucusunun ağ adresi (`hostUri`): Expo Go ile
 *    gerçek bir telefonda test edilirken `localhost` telefonun kendisini
 *    gösterir. Metro'yu çalıştıran bilgisayar backend'i de çalıştırdığı
 *    için onun LAN adresi otomatik kullanılır; geliştiricinin her ağ
 *    değişikliğinde IP adresi yazmasına gerek kalmaz.
 * 3. Platform varsayılanı: Android emülatörü ana makineye `10.0.2.2`
 *    üzerinden, iOS simülatörü ve web ise `localhost` üzerinden erişir.
 */
export function resolveApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  const hostUri = Constants.expoConfig?.hostUri;
  const devHost = hostUri?.split(':')[0];
  if (devHost && devHost !== 'localhost' && devHost !== '127.0.0.1') {
    return `http://${devHost}:${BACKEND_PORT}`;
  }

  if (Platform.OS === 'android') return `http://10.0.2.2:${BACKEND_PORT}`;
  return `http://localhost:${BACKEND_PORT}`;
}

export const API_BASE_URL = resolveApiBaseUrl();

/**
 * Tek bir isteğin en uzun bekleme süresi. Yatak başında dönmeyen bir
 * yükleme göstergesi, anlaşılır bir "sunucuya ulaşılamadı" mesajından
 * daha zararlıdır: hemşire kaydın düşüp düşmediğini bilemez.
 */
export const REQUEST_TIMEOUT_MS = 12_000;
