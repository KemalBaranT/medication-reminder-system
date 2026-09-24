import { type ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidthClass?: string;
}

/** Panel genelinde kullanilan ortak modal kabugu; arka plana tiklayarak veya Escape ile kapatilabilir. */
export function Modal({ title, onClose, children, maxWidthClass = 'max-w-lg' }: ModalProps) {
  const { t } = useTranslation();
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4" onClick={onClose}>
      <div
        className={`card w-full ${maxWidthClass} p-6 max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="text-slate-400 hover:text-slate-700 rounded-md w-8 h-8 flex items-center justify-center hover:bg-slate-100 transition-colors"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
