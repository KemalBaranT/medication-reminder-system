/**
 * Bir kişinin görüntülenen adını, opsiyonel unvan/branşi eklenmiş şekilde
 * biçimlendirir, örn. "Dr. Ahmet Yılmaz - Genel Cerrah". Unvan yalnızca
 * görüntüleme amaçlı veridir (bir arayüz metni değildir), bu yüzden asla
 * i18n üzerinden yönlendirilmez ve aktif arayüz dilinden bağımsız olarak
 * aynı şekilde gösterilir.
 */
export function displayName(person?: { fullName: string; title?: string | null } | null): string {
  if (!person) return '';
  return person.title ? `${person.fullName} - ${person.title}` : person.fullName;
}

/**
 * Sistem genelinde tüm rol kısıtlamalarından muaf tutulan Super Admin rolü.
 * Backend'deki `SUPER_ADMIN_ROLE` ile birebir aynı tutulmalıdır.
 */
export const SUPER_ADMIN_ROLE = 'admin';

/**
 * Panelde rol bazlı her görünürlük ve erişim kararının geçtiği tek kapı:
 * rota koruyucuları, yan menü ve sayfa içi eylem düğmeleri rol listesini
 * doğrudan karşılaştırmaz, bu fonksiyonu çağırır.
 *
 * **Super Admin geçersiz kılması (override):** Super Admin yetkisiyle
 * oturum açıldığında, sistemi yönetmek, test etmek ve acil durumlarda her
 * türlü veriyi düzeltebilmek amacıyla sistem genelindeki tüm güvenlik ve
 * operasyon kısıtlamaları denetim amacıyla aşılır: verilen rol listesi
 * değerlendirilmez ve her eylem (İlaç Ver, Düzenle, Reçete Yaz, Rapor vb.)
 * görünür ve kullanılabilir olur. Backend'deki `RolesGuard` aynı kuralı
 * uygular; burada bir düğmeyi göstermek erişimi kendi başına açmaz,
 * yalnızca sunucunun zaten izin verdiği eylemi arayüzde sunar. Yapılan her
 * işlem Super Admin'in kendi hesabıyla denetim kaydına geçer.
 */
export function hasAnyRole(user: { role: string } | null | undefined, roles: readonly string[]): boolean {
  if (!user) return false;
  return user.role === SUPER_ADMIN_ROLE || roles.includes(user.role);
}
