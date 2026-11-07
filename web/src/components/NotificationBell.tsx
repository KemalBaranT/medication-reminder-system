import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DoseAlert, DoseAlertTier } from '../lib/doseAlerts';
import { useDoseAlerts } from '../notifications/doseAlertsContext';

const TIER_STYLE: Record<DoseAlertTier, { dot: string; label: string }> = {
  overdue: { dot: 'bg-red-500', label: 'text-red-600' },
  due: { dot: 'bg-amber-500', label: 'text-amber-600' },
  prepare: { dot: 'bg-slate-400', label: 'text-slate-500' },
};

const TIER_SECTIONS: DoseAlertTier[] = ['overdue', 'due', 'prepare'];

/**
 * Başlığın sağ üstündeki bildirim zili.
 *
 * Rozet, kullanıcının henüz görmediği uyarı sayısını gösterir; liste
 * açıldığında tüm görünen uyarılar okunmuş sayılır. Liste kademelere göre
 * gruplanır (Gecikmiş → Uygulama Zamanı → Yaklaşan); bir uyarıya tıklamak
 * ilgili hastanın dosyasını açar. Dışarı tıklama veya Escape ile kapanır.
 */
export function NotificationBell() {
  const { enabled, alerts, unreadCount, markAllRead, openPatient } = useDoseAlerts();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) markAllRead();
  }, [open, markAllRead]);

  if (!enabled) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('alerts.bellLabel', { count: unreadCount })}
        aria-expanded={open}
        className={`relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-[background-color,color,box-shadow] duration-200 ease-out hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 ${
          open ? 'bg-slate-100 text-slate-800' : ''
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="badge-pop absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-semibold leading-none text-white ring-2 ring-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label={t('alerts.title')} className="popover-enter absolute right-0 top-12 z-40 w-[380px] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-popover">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{t('alerts.title')}</p>
              <p className="text-xs text-slate-400">{t('alerts.subtitle', { count: alerts.length })}</p>
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">✓</div>
                <p className="text-sm font-medium text-slate-700">{t('alerts.emptyTitle')}</p>
                <p className="text-xs text-slate-400">{t('alerts.emptyText')}</p>
              </div>
            ) : (
              TIER_SECTIONS.map((tier) => {
                const items = alerts.filter((a) => a.tier === tier);
                if (items.length === 0) return null;
                return (
                  <section key={tier} className="py-1.5">
                    <p className={`px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider ${TIER_STYLE[tier].label}`}>
                      {t(`alerts.tier.${tier}`)} · {items.length}
                    </p>
                    {items.map((alert) => (
                      <AlertRow
                        key={alert.key}
                        alert={alert}
                        onSelect={() => {
                          setOpen(false);
                          openPatient(alert.dose.patientWristbandCode);
                        }}
                      />
                    ))}
                  </section>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AlertRow({ alert, onSelect }: { alert: DoseAlert; onSelect: () => void }) {
  const { t } = useTranslation();
  const { dose, tier } = alert;
  const time = new Date(dose.scheduledTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const location = [dose.roomNo && `${t('alerts.room')} ${dose.roomNo}`, dose.bedNo && `${t('alerts.bed')} ${dose.bedNo}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-slate-50"
    >
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TIER_STYLE[tier].dot} ${tier === 'overdue' ? 'animate-pulse' : ''}`} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium text-slate-900">
            {dose.medicationName} <span className="font-normal text-slate-400">· {dose.dosage}</span>
          </span>
          <span className={`shrink-0 text-xs font-semibold tabular-nums ${TIER_STYLE[tier].label}`}>{time}</span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-slate-500">
          {dose.patientName}
          {location ? ` · ${location}` : ''}
        </span>
      </span>
      <svg className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  );
}
