import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';

interface QrCodeModalProps {
  title: string;
  subtitle?: string;
  value: string;
  onClose: () => void;
}

/**
 * Bir bileklik veya ilac kodu icin, ham metin degerini gostermek yerine
 * gercekten taranabilir bir QR kod render eder. `.qr-print-area`,
 * index.css'teki yazdirma stil sayfasi tarafindan hedeflenir; boylece
 * "Yazdir", tum uygulama kabugu yerine temiz, tek basina bir etiket
 * uretir.
 */
export function QrCodeModal({ title, subtitle, value, onClose }: QrCodeModalProps) {
  const { t } = useTranslation();

  return (
    <Modal title={title} onClose={onClose} maxWidthClass="max-w-xs">
      <div className="qr-print-area flex flex-col items-center gap-3 py-2">
        {subtitle && <p className="text-sm font-medium text-slate-700">{subtitle}</p>}
        <div className="p-4 bg-white border border-slate-200 rounded-xl">
          <QRCodeSVG value={value} size={180} level="M" />
        </div>
        <p className="text-base font-mono font-semibold tracking-wider text-slate-800">{value}</p>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn btn-secondary" onClick={onClose}>
          {t('common.close')}
        </button>
        <button className="btn btn-primary" onClick={() => window.print()}>
          {t('common.print')}
        </button>
      </div>
    </Modal>
  );
}
