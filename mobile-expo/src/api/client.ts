import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';

import { tokenStorage } from '../auth/tokenStorage';
import { API_BASE_URL, REQUEST_TIMEOUT_MS } from './config';

/**
 * Uygulamadaki tüm backend hatalarının tek tipi. Ekranlar Axios'a özgü hata
 * nesnelerini değil yalnızca bunu görür; böylece kullanıcıya gösterilecek
 * Türkçe mesaj ve oturum sonu kararı tek yerde üretilir.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Sunucu artık bu oturumu tanımıyor; kullanıcı giriş ekranına yönlendirilmelidir. */
  get isSessionExpired(): boolean {
    return this.status === 401;
  }

  /** Doz başka bir cihazdan zaten kapatılmış (backend 409 Conflict). */
  get isConflict(): boolean {
    return this.status === 409;
  }
}

type SessionExpiredListener = () => void;
let sessionExpiredListener: SessionExpiredListener | null = null;

/**
 * Sessiz yenilemenin de başarısız olduğu durumda (refresh token geçersiz
 * veya süresi dolmuş) çağrılacak dinleyiciyi kaydeder. API katmanı React
 * ağacını tanımaz; oturum durumunu yöneten `SessionProvider` bu kanca ile
 * haberdar edilir.
 */
export function onSessionExpired(listener: SessionExpiredListener | null): void {
  sessionExpiredListener = listener;
}

/**
 * Tüm backend isteklerinin geçtiği Axios örneği.
 *
 * **UTF-8:** Backend Türkçe karakterli (ç, ğ, ı, İ, ö, ş, ü) hasta ve ilaç
 * adları döndürür. `Accept` ve `Content-Type` başlıkları karakter kümesini
 * açıkça belirtir; bazı Android ağ yığınlarının karakter kümesi
 * belirtilmemiş yanıtları ISO-8859-1 olarak çözmesinin önüne geçer.
 */
export const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    Accept: 'application/json; charset=utf-8',
    'Content-Type': 'application/json; charset=utf-8',
  },
});

/** Kimlik doğrulaması gerektirmeyen, dolayısıyla yenileme mantığına girmemesi gereken uç noktalar. */
const PUBLIC_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout'];

http.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  if (PUBLIC_PATHS.some((p) => config.url?.startsWith(p))) return config;
  const token = await tokenStorage.getAccessToken();
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

/**
 * Aynı anda tetiklenen birden fazla 401'in tek bir `/auth/refresh`
 * çağrısını paylaşmasını sağlar. Backend refresh token'ı her kullanımda
 * döndürdüğü (rotate) için, paralel iki yenileme isteğinden ikincisi zaten
 * tüketilmiş bir token sunar ve reddedilir; bu da kullanıcıyı geçerli bir
 * oturumdan haksız yere çıkarırdı.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function performRefresh(): Promise<boolean> {
  const refreshToken = await tokenStorage.getRefreshToken();
  if (!refreshToken) return false;
  try {
    const { data } = await http.post<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
      refreshToken,
    });
    await tokenStorage.saveTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

function refreshOnce(): Promise<boolean> {
  refreshInFlight ??= performRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

type RetriableConfig = AxiosRequestConfig & { _retried?: boolean };

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;
    const status = error.response?.status ?? null;
    const isPublic = PUBLIC_PATHS.some((p) => config?.url?.startsWith(p));

    if (status === 401 && config && !config._retried && !isPublic) {
      config._retried = true;
      if (await refreshOnce()) return http.request(config);
      sessionExpiredListener?.();
    }

    throw toApiError(error);
  },
);

/** Axios hatasını, kullanıcıya gösterilebilir Türkçe mesajlı bir {@link ApiError}'a dönüştürür. */
function toApiError(error: AxiosError): ApiError {
  if (error.code === 'ECONNABORTED') {
    return new ApiError('Sunucuya ulaşılamadı: bağlantı zaman aşımına uğradı.', null);
  }
  if (!error.response) {
    return new ApiError(
      `Sunucuya bağlanılamadı (${API_BASE_URL}). Wi-Fi bağlantınızı ve sunucu adresini kontrol edin.`,
      null,
    );
  }

  const { status, data } = error.response;
  if (status === 401) {
    const url = error.config?.url ?? '';
    return new ApiError(
      url.startsWith('/auth/login') ? 'E-posta veya şifre hatalı.' : 'Oturum süresi doldu, lütfen tekrar giriş yapın.',
      401,
    );
  }
  if (status === 403) {
    return new ApiError('Bu işlem için yetkiniz bulunmuyor.', 403);
  }

  const message = (data as { message?: unknown } | undefined)?.message;
  if (typeof message === 'string') return new ApiError(message, status);
  if (Array.isArray(message)) return new ApiError(message.join(', '), status);
  return new ApiError(`İşlem başarısız oldu (${status}).`, status);
}

/** Bilinmeyen bir hatayı kullanıcıya gösterilebilir metne çevirir. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Beklenmeyen bir hata oluştu.';
}
