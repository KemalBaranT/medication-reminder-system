import { type FormEvent, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { toast } from '../lib/toast';
import { useAuth } from '../auth/AuthContext';
import { displayName, hasAnyRole } from '../lib/roles';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { PatientIdCard } from '../components/ui/PatientIdCard';
import { useHospitalSettings } from '../hooks/useHospitalSettings';
import { useNow } from '../hooks/useNow';
import { AdministerDoseDialog, NextDoseBanner, useTimingLabel } from '../components/DoseAdministration';
import { classifyDoseTiming, isDoseActionable, isDoseOverdue } from '../lib/doseTiming';

interface Medication {
  id: string;
  name: string;
  unit?: string;
}

/** Bir dozun uygulama kaydı; doz planlanan saatten farklı bir anda verilebildiği için gerçek zaman ayrı taşınır. */
interface ScheduleLog {
  action: string;
  performedAt: string;
  nurse: { fullName: string };
}

interface ScheduleItem {
  id: string;
  scheduledTime: string;
  status: string;
  log?: ScheduleLog | null;
}

/** `POST /administration-logs` yanıtı (bkz. AdministrationLogsService.create). */
interface AdministrationLogResponse {
  scheduleId: string;
  scheduleStatus: string;
  action: string;
  performedAt: string;
  performedByName: string;
}

/** Onay penceresinin hangi reçetenin hangi dozu için açıldığı. */
interface AdministerTarget {
  prescription: Prescription;
  schedule: ScheduleItem;
}

interface Prescriber {
  id: string;
  fullName: string;
  title?: string | null;
}

interface Prescription {
  id: string;
  dosage: string;
  route?: string;
  frequencyHours: number;
  status: string;
  nurseNote?: string;
  medication: Medication;
  schedules: ScheduleItem[];
  prescribedBy: Prescriber;
}

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

interface MedicationRow {
  key: string;
  medicationId: string;
  dosage: string;
  route: string;
  frequencyHours: number;
  startAt: string;
  endAt: string;
  nurseNote: string;
}

interface TimelineEntry {
  type:
    | 'admission'
    | 'discharge'
    | 'readmission'
    | 'prescription_created'
    | 'prescription_cancelled'
    | 'dose_administered'
    | 'dose_withheld';
  timestamp: string;
  actor: { fullName: string; title: string | null } | null;
  medicationName?: string;
  dosage?: string;
  reason?: string | null;
}

const RESCHEDULABLE_STATUSES = ['pending', 'notified'];

const TIMELINE_DOT_COLOR: Record<TimelineEntry['type'], string> = {
  admission: '#3b82f6',
  discharge: '#f59e0b',
  readmission: '#3b82f6',
  prescription_created: '#10b981',
  prescription_cancelled: '#ef4444',
  dose_administered: '#10b981',
  dose_withheld: '#ef4444',
};

function emptyRow(key: string): MedicationRow {
  return { key, medicationId: '', dosage: '', route: '', frequencyHours: 8, startAt: '', endAt: '', nurseNote: '' };
}

const medicationForm = { name: '', barcode: '', form: '' };

function usePatientDetailErrorMessage() {
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

function useLocationLabel() {
  const { t } = useTranslation();
  return (p?: Patient): string => {
    if (!p) return '';
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
 * Bir başlangıç saati ve sıklıktan sonraki 5 doz olayını, tamamen istemci
 * tarafında hesaplar; böylece bir doktor göndermeden önce bir planı
 * mantık kontrolünden geçirebilir. Backend, kaydedildiğinde yetkili
 * versiyonu yeniden hesaplar.
 */
function previewDoseTimes(startAt: string, frequencyHours: number, locale: string): string[] {
  if (!startAt || !frequencyHours || frequencyHours < 1) return [];
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) return [];
  const times: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    const t = new Date(start.getTime() + i * frequencyHours * 60 * 60 * 1000);
    const dayLabel = t.toDateString() === start.toDateString() ? '' : ` (${t.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })})`;
    times.push(`${t.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}${dayLabel}`);
  }
  return times;
}

/** Bir ISO zaman damgasını, izleyicinin yerel saat diliminde, bir `datetime-local` girişinin beklediği `YYYY-MM-DDTHH:mm` değerine dönüştürür. */
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Tek bir hastanın klinik kaydı: aktif/geçmiş reçeteleri ve doktorlar için,
 * bir veya birden fazla ilacı tek seferde reçete etmeye yarayan bir form.
 * Doz zamanı önizlemesi ve hızlı ilaç ekleme akışı, backend'in gönderimde
 * gerçekte hesaplayacağı şeyi yansıtan istemci tarafı kolaylıklardır.
 */
export function PatientDetailPage() {
  const { t, i18n } = useTranslation();
  const { patientId } = useParams<{ patientId: string }>();
  const { user } = useAuth();
  const extractErrorMessage = usePatientDetailErrorMessage();
  const locationLabel = useLocationLabel();
  const { hospitalName } = useHospitalSettings();
  const queryClient = useQueryClient();
  /**
   * Sayfadaki tüm rol bazlı eylem kararları [hasAnyRole] üzerinden verilir;
   * Super Admin yetkisiyle oturum açıldığında, yönetim ve denetim amacıyla
   * sistem genelindeki tüm kısıtlamalar aşılır ve reçete yazma, düzenleme,
   * iptal ve ilaç uygulama eylemlerinin tamamı görünür olur.
   */
  const canPrescribe = hasAnyRole(user, ['doctor']);
  const canCancelPrescription = hasAnyRole(user, ['doctor', 'head_nurse']);
  /**
   * "Verildi İşaretle" eylemi backend'deki `POST /administration-logs`
   * guard'ıyla aynı rollere (hemşire, başhemşire ve Super Admin) açıktır;
   * düğmeyi yetkisi olmayan bir role göstermek yalnızca 403 ile
   * sonuçlanacak bir tıklamaya davetiye olurdu.
   */
  const canAdminister = hasAnyRole(user, ['nurse', 'head_nurse']);
  const now = useNow();
  const timingLabel = useTimingLabel();
  const rowKeyCounter = useRef(1);

  const [rows, setRows] = useState<MedicationRow[]>([emptyRow('0')]);
  const [showMedicationForm, setShowMedicationForm] = useState(false);
  const [newMedication, setNewMedication] = useState(medicationForm);
  const [editingPrescription, setEditingPrescription] = useState<Prescription | null>(null);
  const [editForm, setEditForm] = useState({ dosage: '', route: '', nurseNote: '' });
  const [cancelTarget, setCancelTarget] = useState<Prescription | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleItem | null>(null);
  const [scheduleTimeInput, setScheduleTimeInput] = useState('');
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [administerTarget, setAdministerTarget] = useState<AdministerTarget | null>(null);
  const [flashScheduleId, setFlashScheduleId] = useState<string | null>(null);

  const scheduleStatusLabels: Record<string, string> = {
    pending: t('prescriptions.scheduleStatusPending'),
    notified: t('prescriptions.scheduleStatusNotified'),
    administered: t('prescriptions.scheduleStatusAdministered'),
    missed: t('prescriptions.scheduleStatusMissed'),
    skipped: t('prescriptions.scheduleStatusSkipped'),
  };

  const prescriptionStatusLabels: Record<string, string> = {
    active: t('prescriptions.statusActive'),
    completed: t('prescriptions.statusCompleted'),
    cancelled: t('prescriptions.statusCancelled'),
  };

  const { data: patient } = useQuery<Patient>({
    queryKey: ['patients', patientId],
    queryFn: async () => (await api.get(`/patients/${patientId}`)).data,
    enabled: !!patientId,
  });

  const { data: timeline, isLoading: isTimelineLoading } = useQuery<TimelineEntry[]>({
    queryKey: ['patients', patientId, 'timeline'],
    queryFn: async () => (await api.get(`/patients/${patientId}/timeline`)).data,
    enabled: !!patientId,
  });

  const {
    data: prescriptions,
    isLoading,
    isError: isPrescriptionsError,
    error: prescriptionsError,
  } = useQuery<Prescription[]>({
    queryKey: ['prescriptions', patientId],
    queryFn: async () => (await api.get(`/prescriptions/patient/${patientId}`)).data,
    enabled: !!patientId,
  });

  const { data: medications, isError: isMedicationsError } = useQuery<Medication[]>({
    queryKey: ['medications'],
    queryFn: async () => (await api.get('/medications')).data,
    enabled: canPrescribe,
  });

  const createMedication = useMutation({
    mutationFn: async () => (await api.post<Medication>('/medications', newMedication)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medications'] });
      setNewMedication(medicationForm);
      setShowMedicationForm(false);
    },
  });

  /** Her satırı kendi reçetesi olarak gönderir; backend her birinin dozlarını bağımsız olarak planlar, o satırın bitiş tarihi varsa onunla sınırlandırılır. */
  const createPrescriptions = useMutation({
    mutationFn: async () =>
      Promise.all(
        rows.map((row) =>
          api.post('/prescriptions', {
            medicationId: row.medicationId,
            dosage: row.dosage,
            route: row.route || undefined,
            frequencyHours: row.frequencyHours,
            nurseNote: row.nurseNote || undefined,
            patientId,
            startAt: new Date(row.startAt).toISOString(),
            endAt: row.endAt ? new Date(row.endAt).toISOString() : undefined,
          }),
        ),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prescriptions', patientId] });
      queryClient.invalidateQueries({ queryKey: ['patients', patientId, 'timeline'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] });
      rowKeyCounter.current = 1;
      setRows([emptyRow('0')]);
      toast.success(t('prescriptions.createdSuccess'));
    },
  });

  const updatePrescription = useMutation({
    mutationFn: async () => (await api.patch(`/prescriptions/${editingPrescription!.id}`, editForm)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prescriptions', patientId] });
      setEditingPrescription(null);
      toast.success(t('prescriptions.toastUpdated'));
    },
  });

  const cancelPrescription = useMutation({
    mutationFn: async (id: string) => (await api.patch(`/prescriptions/${id}/cancel`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prescriptions', patientId] });
      queryClient.invalidateQueries({ queryKey: ['patients', patientId, 'timeline'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] });
      setCancelTarget(null);
      toast.success(t('prescriptions.toastCancelled'));
    },
  });

  const rescheduleDose = useMutation({
    mutationFn: async () =>
      (await api.patch(`/schedule/${editingSchedule!.id}`, { scheduledTime: new Date(scheduleTimeInput).toISOString() })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prescriptions', patientId] });
      setEditingSchedule(null);
      toast.success(t('prescriptions.toastRescheduled'));
    },
  });

  /**
   * Esnek ilaç uygulama kaydı. Planlanan saat gönderilmez ve doğrulanmaz:
   * backend kaydı, isteği yapan hemşirenin kimliği (JWT) ve sunucunun o
   * anki saatiyle damgalar; doz 15 dk erken veya yarım saat geç verilse de
   * reddedilmez, gerçek zaman olduğu gibi kayda geçer.
   *
   * Başarıda reçete listesi yeniden çekilmeden önbellekte güncellenir; doz
   * satırı anında yeşil "Verildi" rozetine döner ve kısa bir vurguyla
   * işaretlenir. Klinik Seyir ve panel özeti arka planda yenilenir. 409,
   * dozun başka bir cihazdan zaten kapatıldığı anlamına gelir; bu durumda
   * liste sunucudan yenilenir ki hemşire gerçek durumu görsün.
   */
  const administerDose = useMutation({
    mutationFn: async (target: AdministerTarget) =>
      (
        await api.post<AdministrationLogResponse>('/administration-logs', {
          scheduleId: target.schedule.id,
          action: 'administered',
          barcodeVerified: false,
        })
      ).data,
    onSuccess: (log, target) => {
      queryClient.setQueryData<Prescription[]>(['prescriptions', patientId], (prev) =>
        prev?.map((p) => ({
          ...p,
          schedules: p.schedules.map((s) =>
            s.id === log.scheduleId
              ? {
                  ...s,
                  status: log.scheduleStatus,
                  log: { action: log.action, performedAt: log.performedAt, nurse: { fullName: log.performedByName } },
                }
              : s,
          ),
        })),
      );
      queryClient.invalidateQueries({ queryKey: ['patients', patientId, 'timeline'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] });
      setAdministerTarget(null);
      setFlashScheduleId(log.scheduleId);
      toast.success(
        t('administer.toastSuccess', {
          medication: target.prescription.medication.name,
          time: new Date(log.performedAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }),
        }),
      );
    },
    onError: (error) => {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        queryClient.invalidateQueries({ queryKey: ['prescriptions', patientId] });
        setAdministerTarget(null);
        toast.error(t('administer.alreadyRecorded'));
      }
    },
  });

  /**
   * Bir reçetenin "Verildi İşaretle" eyleminin hedeflediği doz: uygulama
   * penceresine girmiş en eski açık doz (gecikmiş dozlar önce gelir, çünkü
   * backend dozları kronolojik döndürür). QR taraması gerektirmez; web
   * paneli, bileklik veya kamera olmadan manuel kaydın birincil yoludur.
   */
  function nextActionableDose(p: Prescription): ScheduleItem | undefined {
    if (!canAdminister || p.status !== 'active') return undefined;
    return p.schedules.find((s) => isDoseActionable(s, now));
  }

  function openAdminister(prescription: Prescription, schedule: ScheduleItem) {
    administerDose.reset();
    setAdministerTarget({ prescription, schedule });
  }

  /** Kayıp veya hasarlı bir fiziksel bileklik için, eskisini geçersiz kılarak yeni bir bileklik kodu verir. */
  const regenerateQr = useMutation({
    mutationFn: async () => (await api.post<Patient>(`/patients/${patientId}/qr-regenerate`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients', patientId] });
      setShowRegenerateConfirm(false);
      toast.success(t('patients.regenerateSuccess'));
    },
  });

  function updateRow(key: string, patch: Partial<MedicationRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    rowKeyCounter.current += 1;
    setRows((prev) => [...prev, emptyRow(String(rowKeyCounter.current))]);
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createPrescriptions.mutate();
  }

  function handleCreateMedication(e: FormEvent) {
    e.preventDefault();
    createMedication.mutate();
  }

  function openEditPrescription(p: Prescription) {
    setEditingPrescription(p);
    setEditForm({ dosage: p.dosage, route: p.route ?? '', nurseNote: p.nurseNote ?? '' });
  }

  function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    updatePrescription.mutate();
  }

  function openEditSchedule(s: ScheduleItem) {
    setEditingSchedule(s);
    setScheduleTimeInput(toDatetimeLocalValue(s.scheduledTime));
  }

  function handleScheduleSubmit(e: FormEvent) {
    e.preventDefault();
    rescheduleDose.mutate();
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{patient ? patient.fullName : t('patients.title')}</h2>
          {patient && (
            <p className="text-sm text-slate-500 mt-1">
              {t('patients.protocolNo')}: {patient.hospitalPatientNo} &middot; {locationLabel(patient)}
            </p>
          )}
        </div>
      </div>

      {showRegenerateConfirm && (
        <ConfirmDialog
          title={t('patients.confirmRegenerateTitle')}
          message={t('patients.confirmRegenerateMessage')}
          confirmLabel={regenerateQr.isPending ? t('patients.regenerating') : t('patients.confirmRegenerateButton')}
          danger
          isLoading={regenerateQr.isPending}
          onConfirm={() => regenerateQr.mutate()}
          onCancel={() => setShowRegenerateConfirm(false)}
        />
      )}

      {/*
        Masaüstünde reçete formu ile bileklik/kimlik kartı yan yana yer
        alır (form solda, kart sağda); küçük ekranlarda ise dikeye
        yığılır ve kimlik kartı - hastayı ilk doğrulanacak şey olduğu
        için - üstte kalır. `lg:order-*` sınıfları, DOM sırasını (kart
        önce, form sonra - böylece dikey yığılmada kart üste gelir)
        masaüstü görsel sırasından (form önce/sol, kart sonra/sağ) ayırır.
      */}
      <div className="mb-6 flex flex-col lg:flex-row gap-6 items-start">
        {patient && (
          <div className="w-full lg:w-auto lg:shrink-0 lg:order-2">
            <PatientIdCard
              hospitalName={hospitalName}
              fullName={patient.fullName}
              protocolNo={patient.hospitalPatientNo}
              locationLabel={locationLabel(patient)}
              wristbandCode={patient.wristbandCode}
              onRegenerateClick={() => setShowRegenerateConfirm(true)}
            />
            {regenerateQr.isError && (
              <p className="print:hidden text-red-600 text-sm mt-2">{extractErrorMessage(regenerateQr.error)}</p>
            )}
          </div>
        )}

        <div className="flex-1 min-w-0 w-full lg:order-1">
          {canPrescribe ? (
            <form onSubmit={handleSubmit} className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-800">{t('prescriptions.assignTitle')}</h3>
                <button type="button" onClick={() => setShowMedicationForm((v) => !v)} className="text-sm text-brand-600 hover:underline">
                  {showMedicationForm ? t('common.cancel') : t('prescriptions.quickAddMedication')}
                </button>
              </div>

              {isMedicationsError && <p className="text-red-600 text-sm mb-3">{t('prescriptions.medicationsLoadError')}</p>}

              {showMedicationForm && (
                <div className="border border-dashed border-slate-300 rounded-lg p-3 mb-4 grid grid-cols-2 gap-2 bg-slate-50">
                  <input
                    placeholder={t('prescriptions.medicationNamePlaceholder')}
                    required
                    value={newMedication.name}
                    onChange={(e) => setNewMedication({ ...newMedication, name: e.target.value })}
                    className="input-field col-span-2"
                  />
                  <input
                    placeholder={t('prescriptions.barcodePlaceholder')}
                    value={newMedication.barcode}
                    onChange={(e) => setNewMedication({ ...newMedication, barcode: e.target.value })}
                    className="input-field"
                  />
                  <input
                    placeholder={t('prescriptions.formPlaceholder')}
                    value={newMedication.form}
                    onChange={(e) => setNewMedication({ ...newMedication, form: e.target.value })}
                    className="input-field"
                  />
                  {createMedication.isError && (
                    <p className="text-red-600 text-sm col-span-2">{extractErrorMessage(createMedication.error)}</p>
                  )}
                  <button
                    type="button"
                    onClick={handleCreateMedication}
                    disabled={createMedication.isPending || !newMedication.name}
                    className="btn btn-secondary col-span-2"
                  >
                    {createMedication.isPending ? t('users.adding') : t('prescriptions.addToCatalog')}
                  </button>
                </div>
              )}

              <div className="space-y-4">
                {rows.map((row, index) => {
                  const dosePreview = previewDoseTimes(row.startAt, row.frequencyHours, i18n.language);
                  return (
                    <div key={row.key} className="rounded-xl border border-slate-200 p-4 bg-slate-50/40">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                          {t('prescriptions.medication')} #{index + 1}
                        </span>
                        {rows.length > 1 && (
                          <button type="button" onClick={() => removeRow(row.key)} className="text-xs text-red-500 hover:text-red-700">
                            {t('prescriptions.removeRow')}
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <label className="field-label">{t('prescriptions.medication')}</label>
                          <select
                            required
                            value={row.medicationId}
                            onChange={(e) => updateRow(row.key, { medicationId: e.target.value })}
                            className="input-field"
                          >
                            <option value="">{t('prescriptions.medicationSelect')}</option>
                            {medications?.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="field-label">{t('prescriptions.dosage')}</label>
                          <input
                            placeholder={t('prescriptions.dosagePlaceholder')}
                            required
                            value={row.dosage}
                            onChange={(e) => updateRow(row.key, { dosage: e.target.value })}
                            className="input-field"
                          />
                        </div>
                        <div>
                          <label className="field-label">
                            {t('prescriptions.route')} ({t('common.optional')})
                          </label>
                          <input
                            placeholder={t('prescriptions.routePlaceholder')}
                            value={row.route}
                            onChange={(e) => updateRow(row.key, { route: e.target.value })}
                            className="input-field"
                          />
                        </div>
                        <div>
                          <label className="field-label">{t('prescriptions.frequency')}</label>
                          <input
                            type="number"
                            min={1}
                            required
                            value={row.frequencyHours}
                            onChange={(e) => updateRow(row.key, { frequencyHours: Number(e.target.value) })}
                            className="input-field"
                          />
                        </div>
                        <div>
                          <label className="field-label">{t('prescriptions.startTime')}</label>
                          <input
                            type="datetime-local"
                            required
                            value={row.startAt}
                            onChange={(e) => updateRow(row.key, { startAt: e.target.value })}
                            className="input-field"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="field-label">{t('prescriptions.endDate')}</label>
                          <input
                            type="datetime-local"
                            value={row.endAt}
                            min={row.startAt || undefined}
                            onChange={(e) => updateRow(row.key, { endAt: e.target.value })}
                            className="input-field"
                          />
                          <p className="text-xs text-slate-400 mt-1">{t('prescriptions.endDateHint')}</p>
                        </div>
                        <div className="col-span-2">
                          <label className="field-label">{t('prescriptions.nurseNote')}</label>
                          <textarea
                            placeholder={t('prescriptions.nurseNotePlaceholder')}
                            value={row.nurseNote}
                            onChange={(e) => updateRow(row.key, { nurseNote: e.target.value })}
                            className="input-field resize-none"
                            rows={2}
                          />
                        </div>
                      </div>

                      {dosePreview.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs text-slate-500 mb-1.5">{t('prescriptions.dosePreview')}</p>
                          <div className="flex gap-2 flex-wrap">
                            {dosePreview.map((time, i) => (
                              <span key={i} className="text-xs bg-brand-50 text-brand-700 rounded-full px-3 py-1 font-medium">
                                {time}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <button type="button" onClick={addRow} className="btn btn-secondary mt-4">
                {t('prescriptions.addMedicationRow')}
              </button>

              {createPrescriptions.isError && (
                <p className="text-red-600 text-sm mt-3">{extractErrorMessage(createPrescriptions.error)}</p>
              )}

              <button type="submit" disabled={createPrescriptions.isPending} className="btn btn-primary w-full mt-4">
                {createPrescriptions.isPending ? t('prescriptions.savingAll') : t('prescriptions.saveAll')}
              </button>
            </form>
          ) : (
            <div className="bg-slate-50 text-slate-600 text-sm rounded-xl px-4 py-3 border border-slate-200">
              {t('prescriptions.notDoctorInfo')}
            </div>
          )}
        </div>
      </div>

      {isPrescriptionsError ? (
        <p className="text-red-600 text-sm">{extractErrorMessage(prescriptionsError)}</p>
      ) : isLoading ? (
        <p className="text-slate-500">{t('common.loading')}</p>
      ) : !prescriptions || prescriptions.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">{t('prescriptions.noPrescriptions')}</div>
      ) : (
        <div className="space-y-4">
          {prescriptions.map((p) => (
            <div key={p.id} className="card p-5">
              <div className="flex justify-between items-start mb-1">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    {p.medication.name} - {p.dosage} ({p.frequencyHours}h)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">{t('prescriptions.prescribedBy', { name: displayName(p.prescribedBy) })}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`status-badge ${
                      p.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700'
                        : p.status === 'cancelled'
                          ? 'bg-red-50 text-red-600'
                          : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {prescriptionStatusLabels[p.status] ?? p.status}
                  </span>
                  {(() => {
                    const nextDose = nextActionableDose(p);
                    return nextDose ? (
                      <button onClick={() => openAdminister(p, nextDose)} className="action-btn action-btn-success">
                        ✓ {t('administer.markGivenButton')}
                      </button>
                    ) : null;
                  })()}
                  {canPrescribe && p.status === 'active' && (
                    <button onClick={() => openEditPrescription(p)} className="action-btn action-btn-neutral">
                      {t('prescriptions.editButton')}
                    </button>
                  )}
                  {canCancelPrescription && p.status === 'active' && (
                    <button onClick={() => setCancelTarget(p)} className="action-btn action-btn-danger">
                      {t('prescriptions.cancelButton')}
                    </button>
                  )}
                </div>
              </div>

              {p.nurseNote && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-3 py-2 mb-3 mt-2 flex gap-2">
                  <span>⚠</span>
                  <span>
                    <strong className="font-medium">{t('prescriptions.nurseNoteDisplayLabel')}:</strong> {p.nurseNote}
                  </span>
                </div>
              )}

              {(() => {
                const nextDose = nextActionableDose(p);
                return nextDose ? (
                  <NextDoseBanner scheduledTime={nextDose.scheduledTime} />
                ) : null;
              })()}

              <table className="w-full text-sm mt-3">
                <thead>
                  <tr className="text-left text-slate-400">
                    <th className="py-1 font-medium">{t('prescriptions.scheduleTime')}</th>
                    <th className="py-1 font-medium">{t('prescriptions.scheduleStatus')}</th>
                    <th className="py-1 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {p.schedules.map((s) => (
                    <tr
                      key={s.id}
                      className={`border-t border-slate-100 ${s.id === flashScheduleId ? 'dose-row-flash' : ''}`}
                      onAnimationEnd={() => setFlashScheduleId(null)}
                    >
                      <td className="py-1.5 text-slate-700">{new Date(s.scheduledTime).toLocaleString(i18n.language)}</td>
                      <td className="py-1.5 text-slate-600">
                        {s.status === 'administered' ? (
                          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="status-badge bg-emerald-100 text-emerald-800">✓ {t('administer.badgeGiven')}</span>
                            {s.log && (
                              <span className="text-xs text-slate-500">
                                {t('administer.givenDetail', {
                                  time: new Date(s.log.performedAt).toLocaleTimeString(i18n.language, {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  }),
                                  name: s.log.nurse.fullName,
                                })}{' '}
                                · {timingLabel(classifyDoseTiming(s.scheduledTime, new Date(s.log.performedAt)))}
                              </span>
                            )}
                          </span>
                        ) : isDoseOverdue(s, now) ? (
                          <span className="status-badge bg-red-50 text-red-700">
                            {t('administer.badgeOverdue')} · {timingLabel(classifyDoseTiming(s.scheduledTime, now))}
                          </span>
                        ) : (
                          (scheduleStatusLabels[s.status] ?? s.status)
                        )}
                      </td>
                      <td className="py-1.5 text-right">
                        <span className="inline-flex gap-2">
                          {canAdminister &&
                            p.status === 'active' &&
                            isDoseActionable(s, now) &&
                            s.id !== nextActionableDose(p)?.id && (
                              <button onClick={() => openAdminister(p, s)} className="action-btn action-btn-success">
                                {t('administer.markGivenButton')}
                              </button>
                            )}
                          {canCancelPrescription && RESCHEDULABLE_STATUSES.includes(s.status) && (
                            <button onClick={() => openEditSchedule(s)} className="action-btn action-btn-primary">
                              {t('prescriptions.editTime')}
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8">
        <h3 className="text-lg font-bold text-slate-900 mb-4">{t('timeline.title')}</h3>
        {isTimelineLoading ? (
          <p className="text-slate-500">{t('common.loading')}</p>
        ) : !timeline || timeline.length === 0 ? (
          <div className="card p-8 text-center text-slate-500">{t('timeline.empty')}</div>
        ) : (
          <div className="card p-6 max-w-3xl">
            {timeline.map((entry, index) => (
              <div key={index} className="timeline-item">
                <span className="timeline-dot" style={{ backgroundColor: TIMELINE_DOT_COLOR[entry.type] }} />
                <p className="text-sm font-medium text-slate-800">
                  {entry.type === 'prescription_created' &&
                    t('timeline.prescriptionCreated', { medication: entry.medicationName, dosage: entry.dosage })}
                  {entry.type === 'prescription_cancelled' &&
                    t('timeline.prescriptionCancelled', { medication: entry.medicationName })}
                  {entry.type === 'dose_administered' &&
                    t('timeline.doseAdministered', { medication: entry.medicationName, dosage: entry.dosage })}
                  {entry.type === 'dose_withheld' &&
                    t('timeline.doseWithheld', { medication: entry.medicationName, dosage: entry.dosage })}
                  {entry.type === 'admission' && t('timeline.admission')}
                  {entry.type === 'discharge' && t('timeline.discharge')}
                  {entry.type === 'readmission' && t('timeline.readmission')}
                </p>
                {entry.type === 'dose_withheld' && entry.reason && (
                  <p className="text-xs text-red-500 mt-0.5">
                    {t('timeline.withheldReason', { reason: t(`reasons.${entry.reason}`, entry.reason) })}
                  </p>
                )}
                <p className="text-xs text-slate-400 mt-0.5">
                  {new Date(entry.timestamp).toLocaleString(i18n.language)}
                  {entry.actor && ` · ${t('timeline.by', { name: displayName(entry.actor) })}`}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {editingPrescription && (
        <Modal title={t('prescriptions.editModalTitle')} onClose={() => setEditingPrescription(null)}>
          <form onSubmit={handleEditSubmit} className="space-y-3">
            <div>
              <label className="field-label">{t('prescriptions.dosage')}</label>
              <input
                required
                value={editForm.dosage}
                onChange={(e) => setEditForm({ ...editForm, dosage: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="field-label">{t('prescriptions.route')}</label>
              <input
                value={editForm.route}
                onChange={(e) => setEditForm({ ...editForm, route: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="field-label">{t('prescriptions.nurseNote')}</label>
              <textarea
                value={editForm.nurseNote}
                onChange={(e) => setEditForm({ ...editForm, nurseNote: e.target.value })}
                className="input-field resize-none"
                rows={3}
              />
            </div>
            <p className="text-xs text-slate-400">{t('prescriptions.editModalHint')}</p>
            {updatePrescription.isError && <p className="text-red-600 text-sm">{extractErrorMessage(updatePrescription.error)}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn btn-secondary" onClick={() => setEditingPrescription(null)}>
                {t('common.cancel')}
              </button>
              <button type="submit" className="btn btn-primary" disabled={updatePrescription.isPending}>
                {updatePrescription.isPending ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editingSchedule && (
        <Modal title={t('prescriptions.editTimeModalTitle')} onClose={() => setEditingSchedule(null)}>
          <form onSubmit={handleScheduleSubmit} className="space-y-3">
            <div>
              <label className="field-label">{t('prescriptions.newTime')}</label>
              <input
                type="datetime-local"
                required
                value={scheduleTimeInput}
                onChange={(e) => setScheduleTimeInput(e.target.value)}
                className="input-field"
              />
            </div>
            <p className="text-xs text-slate-400">{t('prescriptions.editTimeHint')}</p>
            {rescheduleDose.isError && <p className="text-red-600 text-sm">{extractErrorMessage(rescheduleDose.error)}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn btn-secondary" onClick={() => setEditingSchedule(null)}>
                {t('common.cancel')}
              </button>
              <button type="submit" className="btn btn-primary" disabled={rescheduleDose.isPending}>
                {rescheduleDose.isPending ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {administerTarget && (
        <AdministerDoseDialog
          patientName={patient?.fullName}
          medicationName={administerTarget.prescription.medication.name}
          dosage={administerTarget.prescription.dosage}
          route={administerTarget.prescription.route}
          nurseNote={administerTarget.prescription.nurseNote}
          scheduledTime={administerTarget.schedule.scheduledTime}
          isLoading={administerDose.isPending}
          errorMessage={administerDose.isError ? extractErrorMessage(administerDose.error) : undefined}
          onConfirm={() => administerDose.mutate(administerTarget)}
          onCancel={() => setAdministerTarget(null)}
        />
      )}

      {cancelTarget && (
        <ConfirmDialog
          title={t('prescriptions.confirmCancelTitle')}
          message={t('prescriptions.confirmCancelMessage', { medication: cancelTarget.medication.name })}
          confirmLabel={t('prescriptions.confirmCancelButton')}
          danger
          isLoading={cancelPrescription.isPending}
          onConfirm={() => cancelPrescription.mutate(cancelTarget.id)}
          onCancel={() => setCancelTarget(null)}
        />
      )}
    </div>
  );
}
