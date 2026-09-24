import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Bir rotaya veya controller'a hangi personel rollerinin erişebileceğini
 * bildirir. İstek anında `RolesGuard` tarafından okunur; hiç `@Roles()`
 * bulunmayan bir handler, kimliği doğrulanmış her kullanıcıya açık kabul
 * edilir. Bu yüzden dekoratör katmanlıdır (erişimi daraltır) ve her
 * rotanın mutlaka belirtmesi gereken bir şey değildir.
 *
 * Buradaki liste Super Admin'i (`admin`) bağlamaz: bu rol, sistem
 * genelindeki tüm kısıtlamaları yönetim ve denetim amacıyla aşar (bkz.
 * `SUPER_ADMIN_ROLE`). Listede `admin` bulunan rotalar okunabilirlik için
 * öyle bırakılmıştır; eklenmesi veya çıkarılması yetkiyi değiştirmez.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
