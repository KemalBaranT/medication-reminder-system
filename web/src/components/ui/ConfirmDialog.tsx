import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Yikici veya geri alinmasi zor eylemler (silme, taburcu etme, recete
 * iptali) icin ortak onay kapisi. Bunu burada merkezilestirmek, panel
 * genelindeki her boyle eylemin kazara tek tiklama yerine bilincli iki
 * adimli bir onay olmasini garanti eder.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger = false,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <Modal title={title} onClose={onCancel} maxWidthClass="max-w-sm">
      <p className="text-sm text-slate-600 mb-6">{message}</p>
      <div className="flex justify-end gap-2">
        <button className="btn btn-secondary" onClick={onCancel} disabled={isLoading}>
          {t('common.cancel')}
        </button>
        <button className={`btn ${danger ? 'btn-danger-solid' : 'btn-primary'}`} onClick={onConfirm} disabled={isLoading}>
          {isLoading ? t('common.processing') : (confirmLabel ?? t('common.confirm'))}
        </button>
      </div>
    </Modal>
  );
}
