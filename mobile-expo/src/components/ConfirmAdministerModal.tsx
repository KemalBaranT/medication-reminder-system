import * as Haptics from 'expo-haptics';
import { AlertCircle, Pill, QrCode, StickyNote, UserRound } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';

import { errorMessage } from '../api/client';
import type { ScheduleItem } from '../domain/types';
import { formatLocation } from '../domain/worklist';
import { palette, radius, shadow, spacing, typography } from '../theme/tokens';
import { formatTime } from '../utils/format';

interface Props {
  /** Onaylanacak doz; `null` iken modal kapalıdır. */
  dose: ScheduleItem | null;
  /** Hasta ve ilaç QR ile doğrulandıysa onay penceresinde bu bilgi gösterilir. */
  verifiedByQr?: boolean;
  onCancel: () => void;
  /** Kaydı yapar; hata fırlatırsa mesaj modal içinde gösterilir ve modal açık kalır. */
  onConfirm: () => Promise<void>;
}

/**
 * "Verildi" kaydından önceki son güvenlik adımı.
 *
 * **Neden kaydırma doğrudan kaydetmiyor:** Kaydırma hareketi hızlıdır ve
 * liste kaydırılırken istemeden tetiklenebilir. İlaç uygulama kaydı geri
 * alınamaz bir klinik olaydır (backend aynı doza ikinci kaydı reddeder);
 * bu nedenle her kayıt, hasta ve ilacın açıkça gösterildiği bir onay
 * penceresinden geçer. Pencere yalnızca iki seçenek sunar — İptal ve
 * Onayla — ve başka bir karar gerektirmez; ek sürtünme yaratmadan hatalı
 * kaydı önler.
 *
 * Kayıt başarısız olursa (ağ hatası, doz başka cihazdan kapatılmış) modal
 * açık kalır ve hata içinde gösterilir; hemşire kaydın düşmediğini
 * yanlışlıkla varsaymaz.
 */
export function ConfirmAdministerModal({ dose, verifiedByQr = false, onCancel, onConfirm }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (dose) {
      setError(null);
      setSubmitting(false);
    }
  }, [dose]);

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(errorMessage(e));
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={dose != null} transparent animationType="none" statusBarTranslucent onRequestClose={onCancel}>
      {dose && (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={submitting ? undefined : onCancel} />
          <Animated.View entering={ZoomIn.springify().damping(18)} style={styles.sheet}>
            <View style={styles.iconBadge}>
              <Pill size={26} color={palette.done} strokeWidth={2.4} />
            </View>
            <Text style={styles.title}>İlaç Uygulama Onayı</Text>
            <Text style={styles.question}>
              Bu ilacı <Text style={styles.emphasis}>'Verildi'</Text> olarak işaretlemek istediğinize emin misiniz?
            </Text>

            <View style={styles.summary}>
              <Row icon={<UserRound size={16} color={palette.textMuted} />} primary={dose.patientName} secondary={formatLocation(dose)} />
              <Row
                icon={<Pill size={16} color={palette.textMuted} />}
                primary={`${dose.medicationName} · ${dose.dosage}`}
                secondary={`Planlanan saat ${formatTime(dose.scheduledTime)}`}
              />
              {dose.nurseNote ? (
                <Row icon={<StickyNote size={16} color={palette.due} />} primary={dose.nurseNote} secondary="Doktor talimatı" />
              ) : null}
              {verifiedByQr ? (
                <Row icon={<QrCode size={16} color={palette.done} />} primary="QR ile doğrulandı" secondary="Hasta ve ilaç eşleşti" />
              ) : null}
            </View>

            {error ? (
              <View style={styles.error}>
                <AlertCircle size={16} color={palette.overdue} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.actions}>
              <Pressable
                style={({ pressed }) => [styles.button, styles.cancel, pressed && styles.pressed]}
                onPress={onCancel}
                disabled={submitting}
                accessibilityRole="button"
              >
                <Text style={styles.cancelText}>İptal</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.button, styles.confirm, pressed && styles.pressed]}
                onPress={handleConfirm}
                disabled={submitting}
                accessibilityRole="button"
              >
                {submitting ? <ActivityIndicator color={palette.white} /> : <Text style={styles.confirmText}>Onayla</Text>}
              </Pressable>
            </View>
          </Animated.View>
        </Animated.View>
      )}
    </Modal>
  );
}

function Row({ icon, primary, secondary }: { icon: ReactNode; primary: string; secondary: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowPrimary}>{primary}</Text>
        <Text style={styles.rowSecondary}>{secondary}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  sheet: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'stretch',
    ...shadow.fab,
  },
  iconBadge: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.doneSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { ...typography.heading, color: palette.text, textAlign: 'center' },
  question: { ...typography.body, color: palette.textMuted, textAlign: 'center', marginTop: spacing.sm, lineHeight: 22 },
  emphasis: { color: palette.done, fontWeight: '700' },
  summary: {
    marginTop: spacing.lg,
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  rowIcon: { paddingTop: 2 },
  rowPrimary: { ...typography.body, color: palette.text, fontWeight: '600' },
  rowSecondary: { ...typography.caption, color: palette.textSubtle, marginTop: 1 },
  error: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    backgroundColor: palette.overdueSoft,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  errorText: { ...typography.caption, color: palette.overdue, flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  button: { flex: 1, height: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  cancel: { backgroundColor: palette.surfaceMuted },
  confirm: { backgroundColor: palette.done },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  cancelText: { ...typography.body, fontWeight: '700', color: palette.text },
  confirmText: { ...typography.body, fontWeight: '700', color: palette.white },
});
