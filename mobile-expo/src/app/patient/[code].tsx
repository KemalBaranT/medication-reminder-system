import { router, useLocalSearchParams } from 'expo-router';
import { Check, Hash, MapPin, QrCode, StickyNote, UserRound } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';

import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { useSession } from '../../auth/SessionProvider';
import { ConfirmAdministerModal } from '../../components/ConfirmAdministerModal';
import { StatusPill, urgencyTheme } from '../../components/StatusPill';
import { administrationAvailability } from '../../domain/actionPolicy';
import { DoseUrgency, describeDeviation, isOpenStatus, urgencyAt } from '../../domain/doseTiming';
import type { Patient, Prescription, PrescriptionDose, ScheduleItem } from '../../domain/types';
import { formatLocation } from '../../domain/worklist';
import { useSchedule } from '../../state/ScheduleProvider';
import { palette, radius, spacing, typography } from '../../theme/tokens';
import { formatDay, formatTime } from '../../utils/format';

/** Zaman çizelgesindeki tek bir doz satırı. */
interface TimelineEntry {
  dose: PrescriptionDose;
  prescription: Prescription;
  urgency: DoseUrgency;
  /** Onay modalına ve QR ekranına verilecek, iş listesiyle aynı şekildeki doz temsili. */
  asScheduleItem: ScheduleItem;
}

/**
 * Hasta Detay / Günlük Zaman Çizelgesi ekranı.
 *
 * Ana ekrandaki tekil kart yalnızca hastanın en acil dozunu gösterir; bu
 * ekran ise o günün tam planını — geçmiş (verilmiş/kaçırılmış), şimdiki
 * (saati gelmiş/gecikmiş) ve gelecek dozları — tek bir dikey zaman
 * çizelgesinde sunar. Çizelge üzerinde "Şimdi" işaretçisi, geçmiş ile
 * gelecek dozları ayırır.
 *
 * Bildirime dokunularak açıldığında (`?focus=<doz kimliği>`), uyarının ait
 * olduğu doz kendi aciliyet rengindeki kalın kenarlıkla vurgulanır.
 *
 * **Veri kaynağı:** İş listesi (`/schedule/mine`) yalnızca açık ve bugün
 * verilmiş dozları içerir; uygulanmadı olarak kapatılmış dozlar ve başka
 * hemşireye atanmış dozlar orada yoktur. Hastanın eksiksiz günlük planı
 * için bu ekran hasta dosyasını (`/prescriptions/patient/:id`) okur.
 */
export default function PatientTimelineScreen() {
  const { code, focus } = useLocalSearchParams<{ code: string; focus?: string }>();
  const { permissions } = useSession();
  const { administer, findDose, refresh: refreshWorklist } = useSchedule();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<ScheduleItem | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const p = await api.patientByWristband(code);
      const rx = await api.prescriptionsForPatient(p.id);
      setPatient(p);
      setPrescriptions(rx);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setNow(Date.now());
      setLoading(false);
      setRefreshing(false);
    }
  }, [code]);

  useEffect(() => {
    void load();
  }, [load]);

  const entries = useMemo(() => (patient ? buildTodayTimeline(patient, prescriptions, now) : []), [patient, prescriptions, now]);

  /** "Şimdi" işaretçisinin çizelgede yerleşeceği sıra: saati şu andan sonraki ilk doz. */
  const nowIndex = useMemo(() => {
    const idx = entries.findIndex((e) => Date.parse(e.dose.scheduledTime) > now);
    return idx === -1 ? entries.length : idx;
  }, [entries, now]);

  const completed = entries.filter((e) => !isOpenStatus(e.dose.status)).length;

  const confirm = async () => {
    if (!pendingConfirm) return;
    await administer(pendingConfirm.id, { barcodeVerified: false });
    setPendingConfirm(null);
    await load();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  if (!patient) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Hasta dosyası açılamadı</Text>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retry} onPress={() => void load()}>
          <Text style={styles.retryText}>Tekrar Dene</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={palette.primary}
            onRefresh={() => {
              setRefreshing(true);
              void load();
              void refreshWorklist();
            }}
          />
        }
      >
        <Animated.View entering={FadeInDown.duration(350)} style={styles.patientCard}>
          <View style={styles.avatar}>
            <UserRound size={26} color={palette.onSecondaryContainer} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.patientName}>{patient.fullName}</Text>
            <View style={styles.metaRow}>
              <MapPin size={13} color={palette.textSubtle} />
              <Text style={styles.meta}>{formatLocation(patient)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Hash size={13} color={palette.textSubtle} />
              <Text style={styles.meta}>Protokol {patient.hospitalPatientNo}</Text>
            </View>
          </View>
        </Animated.View>

        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle}>{formatDay(now)}</Text>
            <Text style={styles.progressValue}>
              {completed}/{entries.length} doz
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${entries.length ? (completed / entries.length) * 100 : 0}%` as const }]} />
          </View>
        </View>

        {error ? <Text style={styles.inlineError}>{error}</Text> : null}

        {entries.length === 0 ? (
          <Text style={styles.empty}>Bu hasta için bugün planlanmış doz bulunmuyor.</Text>
        ) : (
          <View style={styles.timeline}>
            {entries.map((entry, index) => {
              const availability = administrationAvailability(entry.urgency, permissions);
              const scannable = availability.enabled && findDose(entry.dose.id) != null;
              return (
                <View key={entry.dose.id}>
                  {index === nowIndex ? <NowMarker now={now} /> : null}
                  <TimelineRow
                    entry={entry}
                    now={now}
                    isLast={index === entries.length - 1 && nowIndex !== entries.length}
                    delay={index * 40}
                    focused={entry.dose.id === focus}
                    canConfirm={availability.enabled}
                    canScan={scannable}
                    lockedReason={availability.reason}
                    onConfirm={() => setPendingConfirm(entry.asScheduleItem)}
                    onScan={() => router.push({ pathname: '/scan/[scheduleId]', params: { scheduleId: entry.dose.id } })}
                  />
                </View>
              );
            })}
            {nowIndex === entries.length ? <NowMarker now={now} /> : null}
          </View>
        )}
      </ScrollView>

      <ConfirmAdministerModal dose={pendingConfirm} onCancel={() => setPendingConfirm(null)} onConfirm={confirm} />
    </>
  );
}

function NowMarker({ now }: { now: number }) {
  return (
    <View style={styles.nowRow}>
      <Text style={styles.nowTime}>{formatTime(now)}</Text>
      <View style={styles.nowDot} />
      <View style={styles.nowLine} />
      <Text style={styles.nowLabel}>Şimdi</Text>
    </View>
  );
}

interface RowProps {
  entry: TimelineEntry;
  now: number;
  isLast: boolean;
  delay: number;
  /** Bildirimden açıldıysa ilgili doz vurgulanır; hemşire hangi dozun uyarısına dokunduğunu hemen görür. */
  focused: boolean;
  canConfirm: boolean;
  canScan: boolean;
  lockedReason?: string;
  onConfirm: () => void;
  onScan: () => void;
}

function TimelineRow({ entry, now, isLast, delay, focused, canConfirm, canScan, lockedReason, onConfirm, onScan }: RowProps) {
  const { dose, prescription, urgency } = entry;
  const theme = urgencyTheme[urgency];
  const isPast = Date.parse(dose.scheduledTime) <= now;
  const administered = dose.status === 'administered';
  const skipped = dose.status === 'skipped';
  const open = isOpenStatus(dose.status);

  return (
    <Animated.View entering={FadeInRight.delay(delay).duration(300)} style={styles.row}>
      <Text style={[styles.rowTime, !open && styles.muted]}>{formatTime(dose.scheduledTime)}</Text>

      <View style={styles.rail}>
        <View style={[styles.dot, { backgroundColor: theme.fg }]}>
          {administered ? <Check size={11} color={palette.white} strokeWidth={3.5} /> : null}
        </View>
        {!isLast ? <View style={styles.railLine} /> : null}
      </View>

      <View
        style={[
          styles.rowCard,
          !open && isPast && styles.rowCardPast,
          urgency === DoseUrgency.Overdue && styles.rowCardOverdue,
          focused && { borderColor: theme.fg, borderWidth: 2 },
        ]}
      >
        <View style={styles.rowHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.medName}>{prescription.medication.name}</Text>
            <Text style={styles.medDose}>
              {prescription.dosage}
              {prescription.route ? ` · ${prescription.route}` : ''}
            </Text>
          </View>
          <StatusPill urgency={urgency} label={skipped ? 'Uygulanmadı' : undefined} />
        </View>

        {administered && dose.log ? (
          <Text style={styles.audit}>
            {formatTime(dose.log.performedAt)} · {dose.log.nurse?.fullName ?? 'Bilinmeyen personel'} ·{' '}
            {describeDeviation(dose.scheduledTime, Date.parse(dose.log.performedAt))}
          </Text>
        ) : open ? (
          <Text style={[styles.audit, { color: theme.fg }]}>{describeDeviation(dose.scheduledTime, now)}</Text>
        ) : null}

        {prescription.nurseNote && open ? (
          <View style={styles.note}>
            <StickyNote size={13} color={palette.due} />
            <Text style={styles.noteText}>{prescription.nurseNote}</Text>
          </View>
        ) : null}

        {open ? (
          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.action, styles.actionQr, !canScan && styles.actionDisabled, pressed && { opacity: 0.8 }]}
              disabled={!canScan}
              onPress={onScan}
            >
              <QrCode size={16} color={canScan ? palette.swipeQr : palette.textSubtle} />
              <Text style={[styles.actionText, { color: canScan ? palette.swipeQr : palette.textSubtle }]}>QR ile Onayla</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.action, styles.actionConfirm, !canConfirm && styles.actionDisabled, pressed && { opacity: 0.8 }]}
              disabled={!canConfirm}
              onPress={onConfirm}
            >
              <Check size={16} color={canConfirm ? palette.white : palette.textSubtle} />
              <Text style={[styles.actionText, { color: canConfirm ? palette.white : palette.textSubtle }]}>
                {canConfirm ? 'Verildi' : lockedReason ?? 'Kilitli'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

/**
 * Hastanın bugüne ait tüm dozlarını kronolojik bir çizelgeye dönüştürür.
 * Önceki günlerden kalan ve hâlâ açık olan (kaydedilmemiş) dozlar da
 * çizelgenin başına eklenir: bunlar hemşirenin bugün ele alması gereken
 * işlerdir ve yalnızca tarih filtresi yüzünden gizlenmemelidir.
 */
function buildTodayTimeline(patient: Patient, prescriptions: Prescription[], now: number): TimelineEntry[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = start.getTime() + 24 * 60 * 60_000;

  const entries: TimelineEntry[] = [];
  for (const rx of prescriptions) {
    for (const dose of rx.schedules) {
      const t = Date.parse(dose.scheduledTime);
      const isToday = t >= start.getTime() && t < end;
      const carriedOver = t < start.getTime() && isOpenStatus(dose.status) && rx.status === 'active';
      if (!isToday && !carriedOver) continue;
      if (rx.status === 'cancelled' && isOpenStatus(dose.status)) continue;

      entries.push({
        dose,
        prescription: rx,
        urgency: urgencyAt(dose.status, dose.scheduledTime, now),
        asScheduleItem: {
          id: dose.id,
          prescriptionId: rx.id,
          status: dose.status,
          scheduledTime: dose.scheduledTime,
          patientName: patient.fullName,
          floor: patient.floor,
          roomNo: patient.roomNo,
          bedNo: patient.bedNo,
          patientWristbandCode: patient.wristbandCode,
          medicationName: rx.medication.name,
          medicationBarcode: rx.medication.barcode,
          dosage: rx.dosage,
          nurseNote: rx.nurseNote,
          prescribedByName: rx.prescribedBy?.fullName ?? null,
          prescribedByTitle: rx.prescribedBy?.title ?? null,
          administeredAt: dose.log?.performedAt ?? null,
          administeredByName: dose.log?.nurse?.fullName ?? null,
        },
      });
    }
  }
  return entries.sort((a, b) => Date.parse(a.dose.scheduledTime) - Date.parse(b.dose.scheduledTime));
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
  errorTitle: { ...typography.heading, color: palette.text },
  errorText: { ...typography.body, color: palette.textMuted, textAlign: 'center' },
  retry: { marginTop: spacing.md, backgroundColor: palette.primary, borderRadius: radius.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  retryText: { ...typography.body, color: palette.white, fontWeight: '700' },
  inlineError: { ...typography.caption, color: palette.overdue },
  patientCard: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
  },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: palette.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  patientName: { ...typography.heading, color: palette.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { ...typography.caption, color: palette.textMuted },
  progressCard: { backgroundColor: palette.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  progressTitle: { ...typography.label, color: palette.textMuted, textTransform: 'capitalize' },
  progressValue: { ...typography.label, color: palette.done },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: palette.surfaceMuted, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: palette.done, borderRadius: 4 },
  empty: { ...typography.body, color: palette.textMuted, textAlign: 'center', marginTop: spacing.xl },
  timeline: { gap: 0 },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  rowTime: { width: 48, ...typography.label, color: palette.text, paddingTop: spacing.md },
  muted: { color: palette.textSubtle },
  rail: { width: 24, alignItems: 'center' },
  dot: { width: 18, height: 18, borderRadius: 9, marginTop: spacing.md, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: palette.background },
  railLine: { flex: 1, width: 2, backgroundColor: palette.border, marginTop: 2 },
  rowCard: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    marginLeft: spacing.sm,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: palette.border,
  },
  rowCardPast: { opacity: 0.75 },
  rowCardOverdue: { borderColor: '#F5C2C2' },
  rowHeader: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  medName: { ...typography.body, fontWeight: '700', color: palette.text },
  medDose: { ...typography.caption, color: palette.textMuted, marginTop: 1 },
  audit: { ...typography.caption, color: palette.textMuted },
  note: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: palette.dueSoft, borderRadius: radius.sm, padding: 6 },
  noteText: { ...typography.caption, color: '#92400E', flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', height: 40, borderRadius: radius.sm },
  actionQr: { backgroundColor: `${palette.swipeQr}14` },
  actionConfirm: { backgroundColor: palette.done },
  actionDisabled: { backgroundColor: palette.surfaceMuted },
  actionText: { ...typography.label },
  nowRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  nowTime: { width: 48, ...typography.caption, color: palette.neutralAccent, fontWeight: '800' },
  nowDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: palette.neutralAccent, marginHorizontal: 6 },
  nowLine: { flex: 1, height: 2, backgroundColor: palette.neutralAccent, marginLeft: spacing.sm },
  nowLabel: { ...typography.caption, color: palette.neutralAccent, fontWeight: '800', marginLeft: spacing.sm },
});
