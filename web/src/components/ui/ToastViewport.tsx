import { useEffect, useState } from 'react';
import { toast, type ToastEvent } from '../../lib/toast';

const AUTO_DISMISS_MS = 4000;

/**
 * React agaci disindan tetiklenenler de dahil, `lib/toast` uzerinden
 * yukseltilen her toast'i render eder (`lib/api.ts`teki Axios interceptor,
 * bunu oturum sonu icin kullanir, cunku orada bir 401'in raporlayacagi bir
 * bilesen yoktur). `App.tsx`te uygulama koku olarak bir kez mount edilir;
 * hicbir sayfa kendi toast durumunu baglamaz.
 */
export function ToastViewport() {
  const [toasts, setToasts] = useState<ToastEvent[]>([]);

  useEffect(() => {
    return toast.subscribe((event) => {
      setToasts((prev) => [...prev, event]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== event.id));
      }, AUTO_DISMISS_MS);
    });
  }, []);

  function dismiss(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 w-[calc(100%-2.5rem)] max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`card p-4 flex items-start gap-3 shadow-lg border-l-4 bg-white ${
            t.type === 'success' ? 'border-l-emerald-500' : 'border-l-red-500'
          }`}
        >
          <span className={`text-base leading-none mt-0.5 ${t.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
            {t.type === 'success' ? '✓' : '⚠'}
          </span>
          <p className="text-sm text-slate-700 flex-1">{t.message}</p>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Kapat"
            className="text-slate-400 hover:text-slate-600 rounded-md w-6 h-6 flex items-center justify-center hover:bg-slate-100 transition-colors shrink-0"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
