import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { useHospitalSettings } from '../hooks/useHospitalSettings';
import { displayName, hasAnyRole } from '../lib/roles';
import { DoseAlertsProvider } from '../notifications/DoseAlertsProvider';
import { NotificationBell } from './NotificationBell';
import { LanguageSwitcher } from './ui/LanguageSwitcher';

/**
 * Yan menü navigasyonu, her öğe rol bazında filtrelenir. `roles: null`,
 * kimlik doğrulanmış her kullanıcıya görünür olduğu anlamına gelir; açık
 * bir liste, App.tsx'teki eşleşen ProtectedRoute'un `allowedRoles`ini
 * yansıtmalıdır, çünkü burada bir bağlantıyı gizlemek bir UX inceliğidir,
 * gerçek erişim kontrolü değildir. Filtre [hasAnyRole] üzerinden
 * uygulandığı için Super Admin tüm menü öğelerini görür.
 */
const NAV_ITEMS = [
  { to: '/', key: 'nav.patients', end: true, roles: null },
  { to: '/reports', key: 'nav.reports', end: false, roles: ['admin', 'head_nurse', 'doctor', 'secretary'] },
  { to: '/users', key: 'nav.personnel', end: false, roles: ['admin', 'head_nurse'] },
];

/**
 * Kimlik doğrulanmış her sayfanın etrafında render edilen kabuk: markalı yan
 * menü, rol filtreli navigasyon, oturum açan kullanıcının hesap menüsü ve
 * içerik alanının üstünde bildirim zilini taşıyan başlık çubuğu.
 *
 * Kademeli bildirim merkezi (`DoseAlertsProvider`) burada, yani yalnızca
 * oturum açılmışken kurulur; iş listesi sorgusu, toast'lar ve ses giriş
 * ekranında hiç çalışmaz. Başlık çubuğu içerikle birlikte kaymaz (sticky)
 * ve yarı saydam, bulanık bir zemin kullanır; uzun sayfalarda zil her zaman
 * erişilebilir kalır.
 */
export function Layout() {
  const { user, logout } = useAuth();
  const { hospitalName } = useHospitalSettings();
  const { t } = useTranslation();

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/20' : 'text-slate-600 hover:bg-slate-100'
    }`;

  return (
    <DoseAlertsProvider key={user?.id ?? 'anonymous'}>
      <div className="flex min-h-screen">
        <aside className="w-64 shrink-0 border-r border-slate-200 bg-white p-4 flex flex-col">
          <div className="flex items-center gap-2.5 px-2 mb-6 mt-1">
            <div className="w-9 h-9 rounded-xl bg-brand-600 text-white flex items-center justify-center text-base font-bold shrink-0">
              +
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{hospitalName}</p>
              <p className="text-xs text-slate-400">{t('nav.panelSubtitle')}</p>
            </div>
          </div>

          <LanguageSwitcher className="mb-6 self-start" />

          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.filter((item) => !item.roles || hasAnyRole(user, item.roles)).map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                {t(item.key)}
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto pt-4 border-t border-slate-100">
            <div className="flex items-center gap-3 px-2 py-2">
              <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-semibold shrink-0">
                {user?.fullName ? user.fullName[0].toUpperCase() : '?'}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate" title={displayName(user)}>
                  {displayName(user)}
                </p>
                <p className="text-xs text-slate-400">{user ? t(`roles.${user.role}`) : ''}</p>
              </div>
            </div>
            <button onClick={logout} className="btn btn-ghost w-full justify-start mt-1 text-slate-500 hover:text-red-600">
              {t('nav.logout')}
            </button>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col h-screen">
          <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-end gap-2 border-b border-slate-200/70 bg-white/80 px-8 backdrop-blur-md supports-[backdrop-filter]:bg-white/70">
            <NotificationBell />
          </header>
          <main className="flex-1 overflow-y-auto p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </DoseAlertsProvider>
  );
}
