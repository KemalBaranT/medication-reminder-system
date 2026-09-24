import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { toast } from '../lib/toast';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

interface UserRow {
  id: string;
  fullName: string;
  title?: string | null;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

/**
 * Rol basina anlamsal etiket renkleri. Doktor daha once "blue" (marka
 * mavisi) kullaniyordu; marka rengi artik kirmiziya gectiginden ve
 * "Sil"/tehlike eylemleri de kirmizi oldugundan, doktor rozeti karisikligi
 * onlemek icin ayri, notr bir tona (amber) tasindi.
 */
const roleBadgeColors: Record<string, string> = {
  admin: 'bg-violet-50 text-violet-700',
  doctor: 'bg-amber-50 text-amber-700',
  head_nurse: 'bg-emerald-50 text-emerald-700',
  nurse: 'bg-cyan-50 text-cyan-700',
  secretary: 'bg-slate-100 text-slate-600',
};

const emptyCreateForm = { fullName: '', title: '', email: '', password: '', role: 'nurse' };

function useUsersErrorMessage() {
  const { t } = useTranslation();
  return (error: unknown): string => {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.message;
      if (Array.isArray(message)) return message.join(', ');
      if (typeof message === 'string') return message;
      if (!error.response) return t('common.backendUnreachable');
    }
    return t('common.unexpectedError');
  };
}

/**
 * Personel Yonetimi modulu: personel hesaplarinin ise alinmasi, duzenlenmesi
 * ve isten cikarilmasi. Yalnizca admin/head_nurse tarafindan erisilebilir
 * (App.tsx'teki ProtectedRoute ile zorunlu kilinir ve backend'in
 * UsersController'daki @Roles() korumasiyla eslenir), cunku sistem erisimi
 * vermek, olagan klinik veri girisinden daha yuksek guven gerektiren bir
 * eylemdir.
 */
export function UsersPage() {
  const { t } = useTranslation();
  const extractErrorMessage = useUsersErrorMessage();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState({ fullName: '', title: '', role: 'nurse', isActive: true, password: '' });
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  const { data: users, isLoading, isError, error, refetch } = useQuery<UserRow[]>({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data,
  });

  const createUser = useMutation({
    mutationFn: async () => (await api.post('/users', createForm)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setCreateForm(emptyCreateForm);
      setShowCreateModal(false);
      toast.success(t('users.toastCreated'));
    },
  });

  const updateUser = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        fullName: editForm.fullName,
        title: editForm.title,
        role: editForm.role,
        isActive: editForm.isActive,
      };
      if (editForm.password) payload.password = editForm.password;
      return (await api.patch(`/users/${editing!.id}`, payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditing(null);
      toast.success(t('users.toastUpdated'));
    },
  });

  const deleteUser = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/users/${id}`)).data as { deleted: boolean; deactivated: boolean },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDeleteTarget(null);
      toast.success(t(result.deactivated ? 'users.toastDeactivated' : 'users.toastDeleted'));
    },
  });

  function handleCreateSubmit(e: FormEvent) {
    e.preventDefault();
    createUser.mutate();
  }

  function openEdit(u: UserRow) {
    setEditing(u);
    setEditForm({ fullName: u.fullName, title: u.title ?? '', role: u.role, isActive: u.isActive, password: '' });
  }

  function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    updateUser.mutate();
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t('users.title')}</h2>
          <p className="text-sm text-slate-500 mt-1">{t('users.subtitle')}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          {t('users.addNew')}
        </button>
      </div>

      {isError ? (
        <div className="bg-red-50 text-red-700 rounded-xl p-4 flex items-center justify-between border border-red-100">
          <span>{extractErrorMessage(error)}</span>
          <button onClick={() => refetch()} className="text-sm font-medium underline">
            {t('common.retry')}
          </button>
        </div>
      ) : isLoading ? (
        <p className="text-slate-500">{t('common.loading')}</p>
      ) : !users || users.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">{t('users.empty')}</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">{t('users.fullName')}</th>
                <th className="px-5 py-3 font-medium">{t('users.title_field')}</th>
                <th className="px-5 py-3 font-medium">{t('users.email')}</th>
                <th className="px-5 py-3 font-medium">{t('users.tableRole')}</th>
                <th className="px-5 py-3 font-medium">{t('patients.status')}</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3 font-medium text-slate-900">{u.fullName}</td>
                  <td className="px-5 py-3 text-slate-500">{u.title || '-'}</td>
                  <td className="px-5 py-3 text-slate-600">{u.email}</td>
                  <td className="px-5 py-3">
                    <span className={`status-badge ${roleBadgeColors[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                      {t(`roles.${u.role}`)}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`status-badge ${u.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
                    >
                      {u.isActive ? t('common.active') : t('common.inactive')}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(u)} className="action-btn action-btn-neutral">
                        {t('common.edit')}
                      </button>
                      <button onClick={() => setDeleteTarget(u)} className="action-btn action-btn-danger">
                        {t('common.delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <Modal title={t('users.addModalTitle')} onClose={() => setShowCreateModal(false)}>
          <form onSubmit={handleCreateSubmit} className="space-y-3">
            <div>
              <label className="field-label">{t('users.fullName')}</label>
              <input
                required
                value={createForm.fullName}
                onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="field-label">
                {t('users.title_field')} ({t('common.optional')})
              </label>
              <input
                value={createForm.title}
                onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                className="input-field"
                placeholder={t('users.titlePlaceholder')}
              />
            </div>
            <div>
              <label className="field-label">{t('users.email')}</label>
              <input
                type="email"
                required
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="field-label">{t('users.password')}</label>
              <input
                type="password"
                required
                minLength={6}
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                className="input-field"
                placeholder={t('users.passwordPlaceholder')}
              />
            </div>
            <div>
              <label className="field-label">{t('users.role')}</label>
              <select
                value={createForm.role}
                onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                className="input-field"
              >
                <option value="doctor">{t('users.roleDoctor')}</option>
                <option value="nurse">{t('users.roleNurse')}</option>
                <option value="head_nurse">{t('users.roleHeadNurse')}</option>
                <option value="admin">{t('users.roleAdmin')}</option>
              </select>
            </div>

            {createUser.isError && <p className="text-red-600 text-sm">{extractErrorMessage(createUser.error)}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                {t('common.cancel')}
              </button>
              <button type="submit" className="btn btn-primary" disabled={createUser.isPending}>
                {createUser.isPending ? t('users.adding') : t('users.addButton')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editing && (
        <Modal title={t('users.editModalTitle')} onClose={() => setEditing(null)}>
          <form onSubmit={handleEditSubmit} className="space-y-3">
            <div>
              <label className="field-label">{t('users.fullName')}</label>
              <input
                required
                value={editForm.fullName}
                onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="field-label">
                {t('users.title_field')} ({t('common.optional')})
              </label>
              <input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="input-field"
                placeholder={t('users.titlePlaceholder')}
              />
            </div>
            <p className="text-xs text-slate-400">{t('users.emailImmutable')}</p>
            <div>
              <label className="field-label">{t('users.role')}</label>
              <select
                value={editForm.role}
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                className="input-field"
              >
                <option value="doctor">{t('users.roleDoctor')}</option>
                <option value="nurse">{t('users.roleNurse')}</option>
                <option value="head_nurse">{t('users.roleHeadNurse')}</option>
                <option value="secretary">{t('users.roleSecretary')}</option>
                <option value="admin">{t('users.roleAdmin')}</option>
              </select>
            </div>
            <div>
              <label className="field-label">{t('users.newPassword')}</label>
              <input
                type="password"
                minLength={6}
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                className="input-field"
                placeholder={t('users.newPasswordPlaceholder')}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={editForm.isActive}
                onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                className="w-4 h-4"
              />
              {t('users.activeCheckbox')}
            </label>

            {updateUser.isError && <p className="text-red-600 text-sm">{extractErrorMessage(updateUser.error)}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>
                {t('common.cancel')}
              </button>
              <button type="submit" className="btn btn-primary" disabled={updateUser.isPending}>
                {updateUser.isPending ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={t('users.confirmDeleteTitle')}
          message={t('users.confirmDeleteMessage', { name: deleteTarget.fullName })}
          confirmLabel={t('users.confirmDeleteButton')}
          danger
          isLoading={deleteUser.isPending}
          onConfirm={() => deleteUser.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
