import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './ui/Modal';
import { useNow } from '../hooks/useNow';
import { classifyDoseTiming, type DoseTiming } from '../lib/doseTiming';

/** Sapma süresini "18 dk" / "1 sa 25 dk" biçimine dönüştürür. */
export function useDurationLabel() {
  const { t } = useTranslation();
  return (minutes: number): string => {
    if (minutes < 60) return t('administer.durationMinutes', { minutes });
    return t('administer.durationHours', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
  };
}

/** Zamanında / geç / erken sapmasını tek satırlık metne çevirir. */
export function useTimingLabel() {
  const { t } = useTranslation();
  const durationLabel = useDurationLabel();
  return (timing: DoseTiming): string => {
    if (timing.kind === 'onTime') return t('administer.timingOnTime');
    const key = timing.kind === 'late' ? 'administer.timingLate' : 'administer.timingEarly';
    return t(key, { duration: durationLabel(timing.minutes) });
  };
}

const TIMING_TONE: Record<DoseTiming['kind'], string> = {
  onTime: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  late: 'bg-red-50 text-red-700 ring-red-200',
  early: 'bg-sky-50 text-sky-700 ring-sky-200',
};

interface NextDoseBannerProps {
  scheduledTime: string;
}

/**
 * Reçete kartında, uygulanması sıradaki dozu öne çıkaran durum şeridi.
 * Hemşirenin doz tablosunda doğru satırı aramasına gerek kalmadan tek
 * bakışta "ne zaman planlanmıştı, şimdi ne durumda" sorusunu yanıtlar;
 * gecikmiş bir doz kırmızı tonla ve nabız efektiyle dikkat çeker. Şerit
 * kasıtlı olarak eylem içermez: aynı doz için tek bir "Verildi İşaretle"
 * düğmesi, kartın başlığında Düzenle / İptal Et eylemlerinin yanında yer
 * alır; aynı kartta aynı işi yapan iki düğme, hangisinin neyi kaydettiği
 * konusunda tereddüt yaratırdı.
 */
export function NextDoseBanner({ scheduledTime }: NextDoseBannerProps) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const timingLabel = useTimingLabel();
  const timing = classifyDoseTiming(scheduledTime, now);
  const isLate = timing.kind === 'late';

  return (
    <div
      className={`mt-3 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${
        isLate ? 'border-red-200 bg-red-50/60' : 'border-emerald-200 bg-emerald-50/60'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="relative flex h-3 w-3 shrink-0">
          {isLate && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />}
          <span className={`relative inline-flex h-3 w-3 rounded-full ${isLate ? 'bg-red-500' : 'bg-emerald-500'}`} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('administer.nextDose')}</p>
          <p className="text-sm text-slate-800">
            <span className="font-semibold">
              {new Date(scheduledTime).toLocaleString(i18n.language, {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <span className={`ml-2 status-badge ring-1 ${TIMING_TONE[timing.kind]}`}>
              {isLate ? `${t('administer.badgeOverdue')} · ${timingLabel(timing)}` : timingLabel(timing)}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

interface AdministerDoseDialogProps {
  patientName?: string;
  medicationName: string;
  dosage: string;
  route?: string;
  nurseNote?: string;
  scheduledTime: string;
  isLoading: boolean;
  errorMessage?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * "İlacı Ver" onay penceresi. Kazara tek tıklamayla doz kapatılmasını
 * önlemek için iki bilinçli adım ister: hemşire önce hasta/ilaç/doz
 * doğrulamasını işaretler, ancak sonra onay düğmesi etkinleşir.
 *
 * Esnek zaman ilkesini kullanıcıya açıkça söyler: planlanan saat yalnızca
 * referanstır, kayıt onaylandığı andaki gerçek saatle (saniyede bir
 * yenilenen canlı saat) ve oturumdaki personelin adıyla oluşturulur.
 * Kesin zaman damgasını sunucu atar; burada gösterilen saat, cihaz saati
 * ile sunucu arasındaki olağan farklar dışında aynı değerdir.
 */
export function AdministerDoseDialog({
  patientName,
  medicationName,
  dosage,
  route,
  nurseNote,
  scheduledTime,
  isLoading,
  errorMessage,
  onConfirm,
  onCancel,
}: AdministerDoseDialogProps) {
  const { t, i18n } = useTranslation();
  const now = useNow(1000);
  const timingLabel = useTimingLabel();
  const [verified, setVerified] = useState(false);
  const timing = classifyDoseTiming(scheduledTime, now);
  const timeFormat: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  const nowLabel = now.toLocaleTimeString(i18n.language, timeFormat);

  return (
    <Modal title={t('administer.modalTitle')} onClose={isLoading ? () => undefined : onCancel} maxWidthClass="max-w-md">
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
        <p className="text-lg font-semibold text-slate-900">
          {medicationName} <span className="text-slate-500 font-normal">· {dosage}</span>
        </p>
        <p className="text-sm text-slate-500 mt-0.5">
          {patientName && `${t('administer.patient')}: ${patientName}`}
          {route && ` · ${route}`}
        </p>
      </div>

      {nurseNote && (
        <div className="mt-3 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-3 py-2 flex gap-2">
          <span aria-hidden>⚠</span>
          <span>
            <strong className="font-medium">{t('prescriptions.nurseNoteDisplayLabel')}:</strong> {nurseNote}
          </span>
        </div>
      )}

      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
        <div className="rounded-lg border border-slate-200 py-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">{t('administer.scheduledAt')}</p>
          <p className="text-xl font-semibold text-slate-500 tabular-nums">
            {new Date(scheduledTime).toLocaleTimeString(i18n.language, timeFormat)}
          </p>
        </div>
        <span className="text-slate-300 text-xl" aria-hidden>
          →
        </span>
        <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 py-2">
          <p className="text-[11px] uppercase tracking-wide text-emerald-600">{t('administer.administeredAt')}</p>
          <p className="text-xl font-bold text-emerald-700 tabular-nums">{nowLabel}</p>
        </div>
      </div>
      <div className="mt-2 text-center">
        <span className={`status-badge ring-1 ${TIMING_TONE[timing.kind]}`}>{timingLabel(timing)}</span>
      </div>

      <div className="mt-4 flex gap-3 rounded-lg bg-sky-50 border border-sky-200 px-3 py-2.5 text-sm text-sky-900">
        <span aria-hidden>🕒</span>
        <div>
          <p className="font-medium">{t('administer.nowNotice', { time: nowLabel })}</p>
          <p className="text-xs text-sky-700 mt-0.5">{t('administer.nowNoticeDetail')}</p>
        </div>
      </div>

      <label className="mt-4 flex items-start gap-2.5 cursor-pointer select-none text-sm text-slate-700">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-emerald-600"
          checked={verified}
          onChange={(e) => setVerified(e.target.checked)}
          disabled={isLoading}
        />
        {t('administer.verifyCheckbox')}
      </label>

      {errorMessage && <p className="text-red-600 text-sm mt-3">{errorMessage}</p>}

      <div className="flex justify-end gap-2 mt-5">
        <button className="btn btn-secondary" onClick={onCancel} disabled={isLoading}>
          {t('common.cancel')}
        </button>
        <button className="btn btn-success" onClick={onConfirm} disabled={!verified || isLoading}>
          {isLoading ? t('common.processing') : t('administer.confirmButton')}
        </button>
      </div>
    </Modal>
  );
}
