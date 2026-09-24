import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';

interface PatientIdCardProps {
  hospitalName: string;
  fullName: string;
  protocolNo: string;
  locationLabel: string;
  wristbandCode: string;
  onRegenerateClick: () => void;
}

/**
 * Hasta detay sayfasindaki "Bileklik & Kimlik" karti: klinik personelin
 * ek bir navigasyona gerek kalmadan dogrulayabilecegi veya yeniden
 * yazdirabilecegi, satir icinde render edilen (tiklayip-goster modalinin
 * arkasinda degil) taranabilir bir bileklik etiketi. index.css'teki
 * `@media print` kuralindan yalnizca `.qr-print-area` hayatta kalir; bu
 * yuzden ekran uzerindeki kabuk (baslik, alt baslik, eylem butonlari) o
 * kural zaten onu basili bileklik etiketinden disariya cikarsa da,
 * netlik icin `print:hidden` olarak isaretlenmistir.
 */
export function PatientIdCard({ hospitalName, fullName, protocolNo, locationLabel, wristbandCode, onRegenerateClick }: PatientIdCardProps) {
  const { t } = useTranslation();

  return (
    <div className="card p-6 max-w-sm">
      <div className="print:hidden mb-1">
        <h3 className="font-semibold text-slate-800">{t('patients.idCardTitle')}</h3>
        <p className="text-xs text-slate-500 mt-0.5">{t('patients.idCardSubtitle')}</p>
      </div>

      <div className="qr-print-area print:block flex flex-col items-center gap-2 py-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{hospitalName}</p>
        <p className="text-lg font-bold text-slate-900 text-center leading-tight">{fullName}</p>
        <div className="text-xs text-slate-500 text-center leading-relaxed">
          <p>
            {t('patients.protocolNo')}: {protocolNo}
          </p>
          <p>{locationLabel}</p>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl mt-2">
          <QRCodeSVG value={wristbandCode} size={180} level="M" />
        </div>
        <p className="text-sm font-mono font-semibold tracking-wider text-slate-700 mt-1">{wristbandCode}</p>
      </div>

      <div className="print:hidden flex gap-2 mt-4">
        <button onClick={() => window.print()} className="btn btn-secondary flex-1">
          {t('common.print')}
        </button>
        <button onClick={onRegenerateClick} className="btn btn-danger flex-1">
          {t('patients.regenerateQr')}
        </button>
      </div>
    </div>
  );
}
