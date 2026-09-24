import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { useHospitalSettings } from '../hooks/useHospitalSettings';
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';

function useLoginErrorMessage() {
  const { t } = useTranslation();
  return (error: unknown): string => {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) return t('auth.invalidCredentials');
      if (!error.response) return t('common.backendUnreachable');
    }
    return t('auth.genericError');
  };
}

/** Her personel rolunun paylastigi herkese acik giris ekrani; hastane adi, markalama giristen once render edilebilsin diye kimlik dogrulamasi olmadan cekilir. */
export function LoginPage() {
  const { login } = useAuth();
  const { hospitalName } = useHospitalSettings();
  const { t } = useTranslation();
  const extractErrorMessage = useLoginErrorMessage();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-50 px-4">
      <LanguageSwitcher className="fixed top-5 right-5" />
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-brand-600 text-white flex items-center justify-center text-2xl font-bold shadow-lg shadow-brand-600/20 mb-4">
            +
          </div>
          <h1 className="text-xl font-bold text-slate-900 text-center">{hospitalName}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('auth.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-8">
          <label htmlFor="login-email" className="field-label">
            {t('auth.email')}
          </label>
          <input
            id="login-email"
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-field mb-4"
            placeholder="ornek@hastane.test"
          />
          <label htmlFor="login-password" className="field-label">
            {t('auth.password')}
          </label>
          <input
            id="login-password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field mb-2"
            placeholder="••••••••"
          />

          {error && <p className="text-red-600 text-sm mt-3 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <button type="submit" disabled={loading} className="btn btn-primary w-full mt-6 h-11">
            {loading ? t('auth.loggingIn') : t('auth.loginButton')}
          </button>
        </form>

        <p className="text-center text-xs text-slate-400 mt-6">{t('auth.footerText', { hospitalName })}</p>
      </div>
    </div>
  );
}
