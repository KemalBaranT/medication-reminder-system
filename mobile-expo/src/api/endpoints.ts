import type {
  AdministrationLogResponse,
  CreateAdministrationLogRequest,
  LoginResponse,
  Patient,
  Prescription,
  ScheduleItem,
} from '../domain/types';
import { http } from './client';

/**
 * Mobil uygulamanın kullandığı backend uç noktalarının tipli kataloğu.
 *
 * Ekranlar URL yazmaz, yalnızca bu fonksiyonları çağırır. Mobil istemcinin
 * backend'e karşı yüzeyi böylece tek dosyada denetlenebilir: yeni bir uç
 * nokta eklenmeden önce burada görünür olması gerekir.
 */
export const api = {
  login: (email: string, password: string) =>
    http.post<LoginResponse>('/auth/login', { email, password }).then((r) => r.data),

  /**
   * Refresh token'ı sunucu tarafında iptal eder. Yalnızca cihazdaki
   * kopyayı silmek yeterli olmazdı: backend'de geçerli kalan bir refresh
   * token, çalınmış bir cihazda oturumu sessizce canlandırabilirdi.
   */
  logout: (refreshToken: string) => http.post('/auth/logout', { refreshToken }).then(() => undefined),

  /**
   * Cihazın Expo push token'ını kaydeder. Backend alanı geriye dönük
   * uyumluluk için `fcmToken` adını taşır; token biçimine bakarak Expo Push
   * Service'i seçer (bkz. backend `DoseAlertDispatcher`). İstek idempotent'tir.
   */
  registerDevice: (pushToken: string, platform: 'android' | 'ios') =>
    http.post('/devices/register', { fcmToken: pushToken, platform }).then(() => undefined),

  /** Giriş ekranında bile hastane adını gösterebilmek için kimlik doğrulaması gerektirmez. */
  hospitalName: () => http.get<{ hospitalName: string }>('/settings').then((r) => r.data.hospitalName),

  /**
   * Oturumdaki personelin bugünkü iş listesi. Hemşire kendisine atanmış ve
   * atanmamış dozları, başhemşire/doktor/Super Admin servis genelini görür
   * (kapsam backend'de belirlenir).
   */
  mySchedule: () => http.get<ScheduleItem[]>('/schedule/mine').then((r) => r.data),

  /** "Hastalar" sekmesi için servisteki tüm hastalar; okuma erişimi her role açıktır. */
  patients: () => http.get<Patient[]>('/patients').then((r) => r.data),

  patientByWristband: (code: string) =>
    http.get<Patient>(`/patients/wristband/${encodeURIComponent(code)}`).then((r) => r.data),

  prescriptionsForPatient: (patientId: string) =>
    http.get<Prescription[]>(`/prescriptions/patient/${encodeURIComponent(patientId)}`).then((r) => r.data),

  /**
   * Bir dozun klinik sonucunu kaydeder. `performedAt`, hemşirenin onay
   * düğmesine bastığı an olarak gönderilir; böylece yavaş bir ağda isteğin
   * sunucuya ulaşma gecikmesi denetim kaydındaki uygulama saatine
   * yansımaz. Backend bu değeri yalnızca son 24 saat içinde ve gelecekte
   * değilse kabul eder, ayrıca sunucu saatini aşamayacak şekilde kırpar
   * (bkz. backend `AdministrationLogsService.resolvePerformedAt`).
   */
  administer: (body: CreateAdministrationLogRequest) =>
    http.post<AdministrationLogResponse>('/administration-logs', body).then((r) => r.data),
};
