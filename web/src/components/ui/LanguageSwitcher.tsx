import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../../i18n/config';

const LABELS: Record<SupportedLanguage, string> = { tr: 'TR', en: 'EN' };

/**
 * Hem yan menude (oturum acik) hem de giris ekraninda (oturum kapali)
 * kullanilan kompakt TR/EN anahtari. Dil degistirmek yalnizca `i18next`in
 * aktif kaynak paketini istemci tarafinda degistirir; hicbir zaman yeniden
 * veri cekmeyi tetiklemez, cunku backend zaten dilden bagimsiz veri
 * dondurur.
 */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { i18n } = useTranslation();
  const current = i18n.resolvedLanguage as SupportedLanguage;

  return (
    <div className={`inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 ${className}`}>
      {SUPPORTED_LANGUAGES.map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => i18n.changeLanguage(lang)}
          aria-pressed={current === lang}
          className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
            current === lang ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {LABELS[lang]}
        </button>
      ))}
    </div>
  );
}
