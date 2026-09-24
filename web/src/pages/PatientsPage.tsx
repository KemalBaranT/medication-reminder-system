import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { toast } from '../lib/toast';
import { useAuth } from '../auth/AuthContext';
import { hasAnyRole } from '../lib/roles';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { QrCodeModal } from '../components/ui/QrCodeModal';
import { StatsCards } from '../components/StatsCards';

interface Patient {
  id: string;
  hospitalPatientNo: string;
  fullName: string;
  floor?: string;
  roomNo?: string;
  bedNo?: string;
  wristbandCode: string;
  status: string;
}

const statusColors: Record<string, string> = {
  admitted: 'bg-emerald-50 text-emerald-700',
  discharged: 'bg-slate-100 text-slate-600',
  transferred: 'bg-amber-50 text-amber-700',
};

const emptyForm = { hospitalPatientNo: '', fullName: '', floor: '', roomNo: '', bedNo: '', wristbandCode: '' };

/**
 * Yalnızca bu roller bir hasta oluşturabilir/düzenleyebilir/taburcu
 * edebilir ve bu, PatientsController'daki @Roles() listesiyle senkron
 * kalmalıdır; silme bir adım daha kısıtlanmıştır (bkz.
 * CAN_DELETE_PATIENT_ROLES), çünkü bir dosyayı kaldırmak, onu düzenlemekten
 * daha zor geri alınır. Listeler [hasAnyRole] üzerinden değerlendirilir;
 * Super Admin, sistem genelindeki geçersiz kılma gereği her iki listeden
 * de bağımsız olarak tüm hasta işlemlerini yapabilir.
 */
const CAN_MANAGE_PATIENT_ROLES = ['secretary', 'head_nurse', 'doctor', 'admin'];
const CAN_DELETE_PATIENT_ROLES = ['head_nurse', 'secretary', 'admin'];

function usePatientsErrorMessage() {
  const { t } = useTranslation();
  return (error: unknown): string => {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.message;
      if (Array.isArray(message)) return message.join(', ');
      if (typeof message === 'string') return message;
      if (error.code === 'ECONNABORTED') return t('common.requestTimeout');
      if (!error.response) return t('common.backendUnreachable');
    }
    return t('common.unexpectedError');
  };
}

/** Kat/oda/yatağı tek bir "Kat - Oda - Yatak" metninde birleştirir; hasta kaydında olmayan alanları atlar. */
function useLocationLabel() {
  const { t } = useTranslation();
  return (p: Patient): string => {
    const parts = [
      p.floor ? `${p.floor}. ${t('patients.floor')}` : null,
      p.roomNo ? `${t('patients.room')} ${p.roomNo}` : null,
      p.bedNo ? `${t('patients.bed')} ${p.bedNo}` : null,
    ];
    const filtered = parts.filter(Boolean);
    return filtered.length ? filtered.join(' - ') : '-';
  };
}

/**
 * Servis sayımı: her yatan/taburcu hastayı listeler ve kabulleri yönetme
 * yetkisi olan roller için oluşturma/düzenleme/taburcu/silme sağlar.
 * Buradaki rol kontrolleri yalnızca arayüz kolaylığı içindir ve backend'in
 * kendi @Roles() korumalarıyla tekrar zorunlu kılınır; bu yüzden gizli bir
 * buton, yetkisiz bir yazma işlemine karşı asla tek koruma değildir.
 */
export function PatientsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const extractErrorMessage = usePatientsErrorMessage();
  const locationLabel = useLocationLabel();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [lastCreated, setLastCreated] = useState<Patient | null>(null);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [dischargeTarget, setDischargeTarget] = useState<Patient | null>(null);
  const [readmitTarget, setReadmitTarget] = useState<Patient | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null);
  const [qrTarget, setQrTarget] = useState<Patient | null>(null);
  const canManage = hasAnyRole(user, CAN_MANAGE_PATIENT_ROLES);
  const canDelete = hasAnyRole(user, CAN_DELETE_PATIENT_ROLES);

  const statusLabels: Record<string, string> = {
    admitted: t('patients.statusAdmitted'),
    discharged: t('patients.statusDischarged'),
    transferred: t('patients.statusTransferred'),
  };

  const {
    data: patients,
    isLoading,
    isError: isListError,
    error: listError,
    refetch,
  } = useQuery<Patient[]>({
    queryKey: ['patients'],
    queryFn: async () => (await api.get('/patients')).data,
  });

  const createPatient = useMutation({
    mutationFn: async () =>
      (await api.post<Patient>('/patients', { ...form, wristbandCode: form.wristbandCode.trim() || undefined })).data,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] });
      setForm(emptyForm);
      setLastCreated(created);
      toast.success(t('patients.toastCreated', { name: created.fullName }));
    },
  });

  const updatePatient = useMutation({
    mutationFn: async () => (await api.patch(`/patients/${editing!.id}`, editForm)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      setEditing(null);
      toast.success(t('patients.toastUpdated'));
    },
  });

  const dischargePatient = useMutation({
    mutationFn: async (id: string) => (await api.patch(`/patients/${id}/discharge`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] });
      setDischargeTarget(null);
      toast.success(t('patients.toastDischarged'));
    },
  });

  const readmitPatient = useMutation({
    mutationFn: async (id: string) => (await api.patch(`/patients/${id}/readmit`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] });
      setReadmitTarget(null);
      toast.success(t('patients.toastReadmitted'));
    },
  });

  const deletePatient = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/patients/${id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] });
      setDeleteTarget(null);
      toast.success(t('patients.toastDeleted'));
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLastCreated(null);
    createPatient.mutate();
  }

  function openEdit(p: Patient) {
    setEditing(p);
    setEditForm({
      hospitalPatientNo: p.hospitalPatientNo,
      fullName: p.fullName,
      floor: p.floor ?? '',
      roomNo: p.roomNo ?? '',
      bedNo: p.bedNo ?? '',
      wristbandCode: p.wristbandCode,
    });
  }

  function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    updatePatient.mutate();
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">{t('patients.title')}</h2>
        <p className="text-sm text-slate-500 mt-1">{t('patients.subtitle')}</p>
      </div>

      <StatsCards />

      {canManage ? (
        <form onSubmit={handleSubmit} className="card p-5 mb-6 max-w-2xl">
          <h3 className="font-semibold text-slate-800 mb-4">{t('patients.addNew')}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="field-label">{t('patients.protocolNo')}</label>
              <input
                required
                value={form.hospitalPatientNo}
                onChange={(e) => setForm({ ...form, hospitalPatientNo: e.target.value })}
                className="input-field"
              />
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="field-label">{t('patients.fullName')}</label>
              <input
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="field-label">{t('patients.floor')}</label>
              <input
                placeholder={t('patients.floorPlaceholder')}
                value={form.floor}
                onChange={(e) => setForm({ ...form, floor: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="field-label">{t('patients.room')}</label>
              <input
                value={form.roomNo}
                onChange={(e) => setForm({ ...form, roomNo: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="field-label">{t('patients.bed')}</label>
              <input
                value={form.bedNo}
                onChange={(e) => setForm({ ...form, bedNo: e.target.value })}
                className="input-field"
              />
            </div>
            <div className="col-span-2 md:col-span-3">
              <label className="field-label">{t('patients.wristband')}</label>
              <input
                value={form.wristbandCode}
                onChange={(e) => setForm({ ...form, wristbandCode: e.target.value })}
                className="input-field"
              />
              <p className="text-xs text-slate-400 mt-1">{t('patients.wristbandHint')}</p>
            </div>
          </div>

          {createPatient.isError && (
            <p className="text-red-600 text-sm mt-3">{extractErrorMessage(createPatient.error)}</p>
          )}

          {lastCreated && (
            <div className="text-sm mt-3 bg-emerald-50 rounded-lg px-3 py-2 text-emerald-700">
              <p>
                {t('patients.createdBanner_pre', { name: lastCreated.fullName })}{' '}
                <Link to={`/patients/${lastCreated.id}`} className="underline font-medium">
                  {t('patients.createdBanner_link')}
                </Link>
                .
              </p>
              <button type="button" onClick={() => setQrTarget(lastCreated)} className="action-btn action-btn-primary mt-2">
                {t('patients.viewQr')}: {lastCreated.wristbandCode}
              </button>
            </div>
          )}

          <button type="submit" disabled={createPatient.isPending} className="btn btn-primary mt-4">
            {createPatient.isPending ? t('patients.adding') : t('patients.addButton')}
          </button>
        </form>
      ) : (
        <div className="bg-amber-50 text-amber-800 text-sm rounded-xl px-4 py-3 mb-6 max-w-2xl border border-amber-100">
          {t('patients.noPermission')}
        </div>
      )}

      {isListError ? (
        <div className="bg-red-50 text-red-700 rounded-xl p-4 flex items-center justify-between border border-red-100">
          <span>{extractErrorMessage(listError)}</span>
          <button onClick={() => refetch()} className="text-sm font-medium underline">
            {t('common.retry')}
          </button>
        </div>
      ) : isLoading ? (
        <p className="text-slate-500">{t('common.loading')}</p>
      ) : !patients || patients.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">{t('patients.empty')}</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">{t('patients.protocolNo')}</th>
                <th className="px-5 py-3 font-medium">{t('patients.fullName')}</th>
                <th className="px-5 py-3 font-medium">{t('patients.location')}</th>
                <th className="px-5 py-3 font-medium">{t('patients.status')}</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3 text-slate-700">{p.hospitalPatientNo}</td>
                  <td className="px-5 py-3 font-medium text-slate-900">{p.fullName}</td>
                  <td className="px-5 py-3 text-slate-600">{locationLabel(p)}</td>
                  <td className="px-5 py-3">
                    <span className={`status-badge ${statusColors[p.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {statusLabels[p.status] ?? p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link to={`/patients/${p.id}`} className="action-btn action-btn-primary">
                        {t('patients.detailLink')}
                      </Link>
                      <button onClick={() => setQrTarget(p)} className="action-btn action-btn-neutral">
                        {t('patients.viewQr')}
                      </button>
                      {canManage && (
                        <>
                          <button onClick={() => openEdit(p)} className="action-btn action-btn-neutral">
                            {t('common.edit')}
                          </button>
                          {p.status === 'admitted' && (
                            <button onClick={() => setDischargeTarget(p)} className="action-btn action-btn-warning">
                              {t('patients.dischargeAction')}
                            </button>
                          )}
                          {p.status === 'discharged' && (
                            <button onClick={() => setReadmitTarget(p)} className="action-btn action-btn-neutral">
                              {t('patients.readmitAction')}
                            </button>
                          )}
                        </>
                      )}
                      {canDelete && (
                        <button onClick={() => setDeleteTarget(p)} className="action-btn action-btn-danger">
                          {t('patients.deleteAction')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={t('patients.editModalTitle')} onClose={() => setEditing(null)}>
          <form onSubmit={handleEditSubmit} className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="field-label">{t('patients.protocolNo')}</label>
              <input
                required
                value={editForm.hospitalPatientNo}
                onChange={(e) => setEditForm({ ...editForm, hospitalPatientNo: e.target.value })}
                className="input-field"
              />
            </div>
            <div className="col-span-2">
              <label className="field-label">{t('patients.fullName')}</label>
              <input
                required
                value={editForm.fullName}
                onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="field-label">{t('patients.floor')}</label>
              <input
                value={editForm.floor}
                onChange={(e) => setEditForm({ ...editForm, floor: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="field-label">{t('patients.room')}</label>
              <input
                value={editForm.roomNo}
                onChange={(e) => setEditForm({ ...editForm, roomNo: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="field-label">{t('patients.bed')}</label>
              <input
                value={editForm.bedNo}
                onChange={(e) => setEditForm({ ...editForm, bedNo: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="field-label">{t('patients.wristband')}</label>
              <input
                required
                value={editForm.wristbandCode}
                onChange={(e) => setEditForm({ ...editForm, wristbandCode: e.target.value })}
                className="input-field"
              />
            </div>

            {updatePatient.isError && (
              <p className="text-red-600 text-sm col-span-2">{extractErrorMessage(updatePatient.error)}</p>
            )}

            <div className="col-span-2 flex justify-end gap-2 mt-2">
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>
                {t('common.cancel')}
              </button>
              <button type="submit" className="btn btn-primary" disabled={updatePatient.isPending}>
                {updatePatient.isPending ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {qrTarget && (
        <QrCodeModal
          title={t('patients.qrModalTitle')}
          subtitle={qrTarget.fullName}
          value={qrTarget.wristbandCode}
          onClose={() => setQrTarget(null)}
        />
      )}

      {dischargeTarget && (
        <ConfirmDialog
          title={t('patients.confirmDischargeTitle')}
          message={t('patients.confirmDischargeMessage', { name: dischargeTarget.fullName })}
          confirmLabel={t('patients.dischargeAction')}
          isLoading={dischargePatient.isPending}
          onConfirm={() => dischargePatient.mutate(dischargeTarget.id)}
          onCancel={() => setDischargeTarget(null)}
        />
      )}

      {readmitTarget && (
        <ConfirmDialog
          title={t('patients.confirmReadmitTitle')}
          message={t('patients.confirmReadmitMessage', { name: readmitTarget.fullName })}
          confirmLabel={t('patients.readmitAction')}
          isLoading={readmitPatient.isPending}
          onConfirm={() => readmitPatient.mutate(readmitTarget.id)}
          onCancel={() => setReadmitTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={t('patients.confirmDeleteTitle')}
          message={t('patients.confirmDeleteMessage', { name: deleteTarget.fullName })}
          confirmLabel={t('patients.confirmDeleteButton')}
          danger
          isLoading={deletePatient.isPending}
          onConfirm={() => deletePatient.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
