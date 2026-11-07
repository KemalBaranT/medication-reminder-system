/**
 * Backend (NestJS + Prisma) yanıtlarının istemci tarafı sözleşmesi.
 *
 * Alan adları, backend'in döndürdüğü JSON ile birebir aynı tutulur;
 * istemci bu katmanda yeniden adlandırma yapmaz. Böylece bir alanın
 * backend'de değişmesi TypeScript derleyicisi tarafından tek noktada
 * yakalanır ve web paneliyle mobil uygulama aynı sözlüğü konuşur.
 * Tarih alanları ISO-8601 metni olarak taşınır ve yalnızca gösterim ya da
 * karşılaştırma anında `Date`'e çevrilir.
 */

/** Prisma `Role` enum'unun birebir karşılığı. */
export type Role = 'admin' | 'doctor' | 'head_nurse' | 'nurse' | 'secretary';

/** Prisma `ScheduleStatus` enum'unun birebir karşılığı. */
export type ScheduleStatus = 'pending' | 'notified' | 'administered' | 'missed' | 'skipped';

/** Oturum açmış personelin profili (`POST /auth/login` → `user`). */
export interface AuthUser {
  id: string;
  fullName: string;
  /** Unvan/branş; yalnızca gösterim amaçlıdır, yetkilendirmeyi etkilemez. */
  title: string | null;
  email: string;
  role: Role;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

/**
 * `GET /schedule/mine` yanıtındaki tek bir planlanmış doz. Liste hem açık
 * dozları hem de bugün "Verildi" olarak kaydedilmiş dozları içerir;
 * ikincilerde `administeredAt` ve `administeredByName` doludur.
 */
export interface ScheduleItem {
  id: string;
  prescriptionId: string;
  status: ScheduleStatus;
  scheduledTime: string;
  patientName: string;
  floor: string | null;
  roomNo: string | null;
  bedNo: string | null;
  /** Hastanın benzersiz bileklik kodu; istemcide hasta kimliği olarak da kullanılır. */
  patientWristbandCode: string;
  medicationName: string;
  medicationBarcode: string | null;
  dosage: string;
  nurseNote: string | null;
  prescribedByName: string | null;
  prescribedByTitle: string | null;
  administeredAt: string | null;
  administeredByName: string | null;
}

/** `GET /patients/wristband/:code` yanıtı. */
export interface Patient {
  id: string;
  hospitalPatientNo: string;
  fullName: string;
  floor: string | null;
  roomNo: string | null;
  bedNo: string | null;
  birthDate: string | null;
  wristbandCode: string;
  status: 'admitted' | 'discharged' | 'transferred';
}

/** `GET /prescriptions/patient/:id` yanıtındaki tek bir planlanmış doz. */
export interface PrescriptionDose {
  id: string;
  scheduledTime: string;
  status: ScheduleStatus;
  log: {
    action: 'administered' | 'not_administered';
    performedAt: string;
    nurse: { fullName: string } | null;
  } | null;
}

/** `GET /prescriptions/patient/:id` yanıtındaki tek bir reçete. */
export interface Prescription {
  id: string;
  dosage: string;
  route: string | null;
  frequencyHours: number;
  status: 'active' | 'completed' | 'cancelled';
  nurseNote: string | null;
  medication: { id: string; name: string; barcode: string | null; form: string | null; unit: string | null };
  prescribedBy: { id: string; fullName: string; title: string | null } | null;
  schedules: PrescriptionDose[];
}

/** `POST /administration-logs` istek gövdesi (bkz. backend `CreateLogDto`). */
export interface CreateAdministrationLogRequest {
  scheduleId: string;
  action: 'administered' | 'not_administered';
  barcodeVerified: boolean;
  notes?: string;
  /** Kararın cihazda verildiği an (ISO-8601). */
  performedAt?: string;
}

/** `POST /administration-logs` yanıtı; kartı listeyi yeniden çekmeden güncellemek için yeterlidir. */
export interface AdministrationLogResponse {
  id: string;
  scheduleId: string;
  scheduleStatus: ScheduleStatus;
  performedAt: string;
  performedById: string;
  performedByName: string;
  barcodeVerified: boolean;
}
