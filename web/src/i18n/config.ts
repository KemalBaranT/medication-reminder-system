import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import tr from './locales/tr.json';
import en from './locales/en.json';

export const SUPPORTED_LANGUAGES = ['tr', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const STORAGE_KEY = 'language';

/**
 * Operatorun dil secimini oturumlar ve tarayici sekmeleri arasinda kalici
 * hale getirir; cunku hastane personeli her oturum acisinda bunu yeniden
 * secmek zorunda kalmamalidir. Tarayicinin kendi dili yerine Turkce'ye
 * (birincil dagitim dili) geri doner; boylece paylasilan bir is istasyonu
 * ongorulebilir sekilde varsayilan olur.
 */
function resolveInitialLanguage(): SupportedLanguage {
  const stored = localStorage.getItem(STORAGE_KEY);
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(stored ?? '') ? (stored as SupportedLanguage) : 'tr';
}

i18n.use(initReactI18next).init({
  resources: {
    tr: { translation: tr },
    en: { translation: en },
  },
  lng: resolveInitialLanguage(),
  fallbackLng: 'tr',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  localStorage.setItem(STORAGE_KEY, lng);
});

export default i18n;
