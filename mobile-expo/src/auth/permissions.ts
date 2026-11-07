import type { AuthUser, Role } from '../domain/types';

/**
 * Sistem genelinde tüm rol kısıtlamalarından muaf tutulan Super Admin rolü.
 * Backend'deki `SUPER_ADMIN_ROLE` (`backend/src/common/roles.guard.ts`) ile
 * birebir aynı tutulmalıdır.
 */
export const SUPER_ADMIN_ROLE: Role = 'admin';

export const roleLabels: Record<Role, string> = {
  admin: 'Super Admin',
  doctor: 'Doktor',
  head_nurse: 'Başhemşire',
  nurse: 'Hemşire',
  secretary: 'Sekreter',
};

/**
 * Oturumdaki kullanıcının arayüzde neleri yapabileceğinin tek kaynağı.
 *
 * Ekranlar rol karşılaştırmasını kendileri yapmaz, yalnızca bu nesnenin
 * alanlarını okur; yetki kuralı değiştiğinde istemcide güncellenecek tek
 * yer burasıdır.
 *
 * **God Mode (Super Admin geçersiz kılması):** Admin rolüyle oturum
 * açıldığında, sistemi test etmek ve acil durumlarda veriyi düzeltebilmek
 * amacıyla arayüzdeki tüm operasyonel kısıtlamalar kaldırılır: devre dışı
 * düğmeler etkinleşir, erken uygulama penceresi uygulanmaz ve QR
 * doğrulaması atlanabilir. Bu, backend'deki `RolesGuard` davranışının
 * istemci karşılığıdır; sunucu da aynı rolü hiçbir `@Roles()` kısıtına
 * takmaz. Geçersiz kılma kimliği değiştirmez: yapılan her kayıt Super
 * Admin'in kendi hesabıyla denetim izine geçer.
 */
export interface Permissions {
  godMode: boolean;
  /** Bir dozu "Verildi" olarak kaydedebilir (backend `POST /administration-logs`). */
  canAdministerDoses: boolean;
  /** Saati henüz gelmemiş (erken pencere dışındaki) bir dozu kaydedebilir. */
  canBypassTimingWindow: boolean;
  /** QR tarayıcısında doğrulamayı atlayıp doğrudan kayda geçebilir. */
  canSkipVerification: boolean;
}

/** Backend'deki `@Roles('nurse', 'head_nurse')` guard'ıyla aynı liste. */
const DOSE_ADMINISTRATION_ROLES: readonly Role[] = ['nurse', 'head_nurse'];

export function derivePermissions(user: AuthUser | null): Permissions {
  const godMode = user?.role === SUPER_ADMIN_ROLE;
  const hasRole = (roles: readonly Role[]) => godMode || (user != null && roles.includes(user.role));
  return {
    godMode,
    canAdministerDoses: hasRole(DOSE_ADMINISTRATION_ROLES),
    canBypassTimingWindow: godMode,
    canSkipVerification: godMode,
  };
}
