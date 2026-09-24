import axios from 'axios';
import { toast } from './toast';

/**
 * Her sayfa tarafindan paylasilan tek Axios ornegi. Temel URL'i,
 * bearer-token eklenmesini ve 401 isleme mantigini burada
 * merkezilestirmek, tek tek sayfalarin yalnizca `api.get/post/...`
 * cagirmasini ve dogrudan kimlik dogrulama basliklarina hicbir zaman
 * dokunmamasini saglar.
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Bir 401, JWT'nin eksik, suresi dolmus veya sonradan devre disi
 * birakilmis bir hesaba ait oldugu anlamina gelir. Depolamayi temizlemek
 * ve buradan /login'e sert yonlendirme yapmak (her sayfanin kendi hata
 * isleyicisinde degil), eskimis bir oturumun asla yari yuklenmis, kimlik
 * dogrulanmis bir ekran gostermeye devam etmemesini garanti eder.
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && window.location.pathname !== '/login') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('authUser');
      // Asagidaki yonlendirme bir sonraki tikte tum uygulamayi kaldirir, bu
      // yuzden bu toast aslinda render edilmek uzere olan giris ekrani
      // icindir - kullanicinin, bulundugu yer yerine neden aniden buraya
      // dustugune dair aldigi tek aciklama budur.
      toast.error('Oturumunuz sona erdi, lütfen tekrar giriş yapın.');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);
