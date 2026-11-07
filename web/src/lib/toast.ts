import { toast as sonner } from 'sonner';

/**
 * Panel genelindeki işlem sonucu bildirimlerinin (kaydedildi, silindi,
 * oturum sona erdi...) tek giriş noktası.
 *
 * Sayfalar ve React ağacı dışında çalışan kodlar (ör. `lib/api.ts`teki
 * Axios interceptor'ı) yalnızca bu iki fonksiyonu çağırır; sunumu Sonner
 * üstlenir (bkz. `components/ui/AppToaster.tsx`). Toast kütüphanesi
 * değişirse çağrı noktalarına dokunulmadan yalnızca bu dosya güncellenir.
 */
export const toast = {
  success: (message: string) => sonner.success(message),
  error: (message: string) => sonner.error(message),
};
