import { router, useLocalSearchParams } from 'expo-router';
import { CheckCircle2, Circle, Pill, ShieldCheck, UserRound } from 'lucide-react-native';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '../../auth/SessionProvider';
import { ConfirmAdministerModal } from '../../components/ConfirmAdministerModal';
import { QrScannerView, type ScanDecision, type ScanSource } from '../../components/QrScannerView';
import { ScannerHeader } from '../../components/ScannerHeader';
import { isOpenStatus } from '../../domain/doseTiming';
import { useSchedule } from '../../state/ScheduleProvider';
import { palette, radius, spacing, typography } from '../../theme/tokens';

type Step = 'patient' | 'medication' | 'done';

/**
 * Bir doz için yatak başı QR doğrulama akışı (ana ekranda sola kaydırma
 * veya zaman çizelgesindeki "QR ile Onayla" ile açılır).
 *
 * **Adımlar:**
 * 1. Hasta bilekliği okutulur ve dozun hastasıyla eşleşmesi zorunludur
 *    (doğru hasta).
 * 2. İlaç kataloğunda barkod tanımlıysa ilaç ambalajı okutulur (doğru
 *    ilaç). Barkod tanımlı değilse bu adım atlanır; yalnızca hasta
 *    doğrulanmış sayılır.
 * 3. Onay modalı açılır; kayıt yalnızca onaylandığında yapılır.
 *
 * **Denetim kaydı:** Kayıt ancak hem bileklik hem ilaç barkodu yatak
 * başında canlı kamerayla okunduysa `barcodeVerified: true` olarak gönderilir.
 * Galeriden okunan bir kod veya God Mode ile atlanan doğrulama, kaydı
 * "manuel" olarak işaretler; kalite birimi raporlarda bu ayrımı görür.
 */
export default function ScanScreen() {
  const { scheduleId } = useLocalSearchParams<{ scheduleId: string }>();
  const { permissions } = useSession();
  const { findDose, administer } = useSchedule();
  const dose = useMemo(() => findDose(scheduleId), [findDose, scheduleId]);
  /**
   * Ekran açıldığı anda doz zaten kapatılmış mıydı. Anlık durum yerine
   * açılıştaki durum kullanılır; aksi halde bu ekrandan yapılan başarılı
   * kayıt, geri dönüş animasyonu sırasında "zaten verildi" uyarısını
   * gösterirdi.
   */
  const [closedOnOpen] = useState(() => (dose ? !isOpenStatus(dose.status) : false));

  const hasMedicationBarcode = !!dose?.medicationBarcode;
  const [step, setStep] = useState<Step>('patient');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const usedGallery = useRef(false);
  const [skippedVerification, setSkippedVerification] = useState(false);

  const handleCode = useCallback(
    async (code: string, source: ScanSource): Promise<ScanDecision> => {
      if (!dose) return { kind: 'reject', message: 'Doz bulunamadı.' };

      if (step === 'patient') {
        if (code !== dose.patientWristbandCode) {
          return { kind: 'reject', message: `Yanlış hasta! Bu bileklik ${dose.patientName} hastasına ait değil.` };
        }
        if (source === 'gallery') usedGallery.current = true;
        if (hasMedicationBarcode) {
          setStep('medication');
          return { kind: 'accept', message: `${dose.patientName} doğrulandı. Şimdi ilacı okutun.` };
        }
        setStep('done');
        setConfirmOpen(true);
        return { kind: 'complete', message: 'Hasta doğrulandı.' };
      }

      if (step === 'medication') {
        if (code !== dose.medicationBarcode) {
          return { kind: 'reject', message: `Yanlış ilaç! Beklenen: ${dose.medicationName}.` };
        }
        if (source === 'gallery') usedGallery.current = true;
        setStep('done');
        setConfirmOpen(true);
        return { kind: 'complete', message: 'İlaç doğrulandı.' };
      }

      return { kind: 'reject', message: 'Doğrulama zaten tamamlandı.' };
    },
    [dose, step, hasMedicationBarcode],
  );

  const skipVerification = () => {
    setSkippedVerification(true);
    setStep('done');
    setConfirmOpen(true);
  };

  const verifiedByQr = step === 'done' && !skippedVerification;
  const barcodeVerified = verifiedByQr && hasMedicationBarcode && !usedGallery.current;

  const confirm = async () => {
    if (!dose) return;
    await administer(dose.id, { barcodeVerified });
    setConfirmOpen(false);
    router.back();
  };

  const cancelConfirm = () => {
    setConfirmOpen(false);
    setSkippedVerification(false);
    usedGallery.current = false;
    setStep('patient');
  };

  if (!dose || closedOnOpen) {
    return (
      <SafeAreaView style={styles.missing}>
        <Text style={styles.missingTitle}>{dose ? 'Bu doz zaten kaydedilmiş' : 'Doz bulunamadı'}</Text>
        <Text style={styles.missingText}>
          {dose
            ? 'Aynı doz için ikinci bir kayıt oluşturulamaz. Hastanın günlük planını zaman çizelgesinden kontrol edin.'
            : 'Bu doz iş listenizde değil veya başka bir cihazdan kapatılmış olabilir. Listeyi yenileyip tekrar deneyin.'}
        </Text>
        <Pressable style={styles.missingButton} onPress={() => router.back()}>
          <Text style={styles.missingButtonText}>Geri Dön</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const instruction =
    step === 'patient'
      ? `${dose.patientName} hastasının bilekliğindeki QR kodu çerçeveye hizalayın`
      : step === 'medication'
        ? `${dose.medicationName} ambalajındaki barkodu okutun`
        : 'Doğrulama tamamlandı';

  return (
    <View style={styles.container}>
      <QrScannerView instruction={instruction} onCode={handleCode} paused={step === 'done'} />

      <ScannerHeader title="Gelişmiş QR Okuyucu" subtitle={`${dose.medicationName} · ${dose.dosage}`}>
        <View style={styles.steps}>
          <StepChip icon={<UserRound size={14} color={palette.white} />} label="Hasta" done={step !== 'patient'} active={step === 'patient'} />
          {hasMedicationBarcode ? (
            <StepChip icon={<Pill size={14} color={palette.white} />} label="İlaç" done={step === 'done'} active={step === 'medication'} />
          ) : null}
        </View>

        {permissions.canSkipVerification && step !== 'done' ? (
          <Pressable style={styles.godSkip} onPress={skipVerification}>
            <ShieldCheck size={13} color={palette.white} />
            <Text style={styles.godSkipText}>Doğrulamayı Atla</Text>
          </Pressable>
        ) : null}
      </ScannerHeader>

      <ConfirmAdministerModal dose={confirmOpen ? dose : null} verifiedByQr={verifiedByQr} onCancel={cancelConfirm} onConfirm={confirm} />
    </View>
  );
}

function StepChip({ icon, label, done, active }: { icon: ReactNode; label: string; done: boolean; active: boolean }) {
  return (
    <View style={[styles.stepChip, done && styles.stepDone, active && styles.stepActive]}>
      {done ? <CheckCircle2 size={14} color={palette.white} /> : active ? icon : <Circle size={14} color={palette.white} />}
      <Text style={styles.stepText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.black },
  steps: { flexDirection: 'row', gap: spacing.sm },
  stepChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  stepActive: { backgroundColor: palette.neutralAccent },
  stepDone: { backgroundColor: palette.done },
  stepText: { ...typography.label, color: palette.white },
  godSkip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  godSkipText: { ...typography.label, color: palette.white },
  missing: { flex: 1, backgroundColor: palette.background, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  missingTitle: { ...typography.heading, color: palette.text },
  missingText: { ...typography.body, color: palette.textMuted, textAlign: 'center' },
  missingButton: { backgroundColor: palette.primary, borderRadius: radius.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  missingButtonText: { ...typography.body, color: palette.white, fontWeight: '700' },
});
