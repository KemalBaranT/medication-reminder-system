import * as Haptics from 'expo-haptics';
import { CircleCheck, Lock, MapPin, Pill, ScanQrCode, TriangleAlert } from 'lucide-react-native';
import { memo, useEffect } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { DoseUrgency } from '../domain/doseTiming';
import { formatLocation, type PatientWorkItem } from '../domain/worklist';
import { palette, radius, shadow, spacing } from '../theme/tokens';
import { formatTime } from '../utils/format';
import { StatusChip } from './StateViews';

/** Bir kaydırmanın eylemi tetiklemesi için gereken, kart genişliğine oranla mesafe. */
const TRIGGER_RATIO = 0.4;
/** Bu hızın üstündeki kısa "fırlatma" hareketleri de eylemi tetikler (px/sn). */
const FLING_VELOCITY = 900;
/** Kilitli yöndeki kaydırmada kartın ne kadar direnç göstereceği (1 = serbest). */
const LOCKED_RESISTANCE = 0.18;
/** Liste kenar boşluğu; kart genişliği ve eşik hesabında kullanılır. */
export const CARD_LIST_PADDING = spacing.md;

/** Bir kaydırma yönünün kullanılabilirliği ve kilitliyse kullanıcıya gösterilecek neden. */
export interface SwipeAvailability {
  enabled: boolean;
  reason?: string;
}

interface Props {
  item: PatientWorkItem;
  now: number;
  /** Sağa kaydırma: manuel onay modalını açar. */
  manual: SwipeAvailability;
  /** Sola kaydırma: QR doğrulama ekranını açar. */
  qr: SwipeAvailability;
  onManualConfirm: (item: PatientWorkItem) => void;
  onScanQr: (item: PatientWorkItem) => void;
  onOpen: (item: PatientWorkItem) => void;
}

/**
 * Ana ekrandaki hasta başına tekil acil kart.
 *
 * **Etkileşim modeli (çift yönlü kaydırma):**
 * - Soldan SAĞA kaydırma → manuel onay süreci (onay modalı açılır; kayıt
 *   modal onaylanmadan yapılmaz). Zemin yeşil "Verildi".
 * - Sağdan SOLA kaydırma → bu doz için Gelişmiş QR Okuyucu açılır. Zemin
 *   koyu "QR ile Onayla".
 * - Dokunma → hastanın günlük zaman çizelgesi açılır.
 *
 * Hareket, UI iş parçacığında (Reanimated worklet'leri) çalışır; liste
 * uzun olsa bile kart parmağı kare kaybı olmadan takip eder. Eşik
 * geçildiği anda hafif bir dokunsal titreşim verilir ki hemşire ekrana
 * bakmadan da eylemin tetikleneceğini hissetsin. Hiçbir hareket kartı
 * listeden çıkarmaz; kart yerine oturur ve yalnızca ilgili akış başlar.
 *
 * **Kilitli yönler:** Yetkisi olmayan bir yöndeki kaydırma tamamen
 * engellenmez; kart dirençle hareket eder ve zeminde kilit ikonu ile
 * nedeni gösterilir. God Mode'da tüm yönler açıktır.
 *
 * **Görsel dil:** Kart, önceki istemcideki gibi beyaz ve minimaldir.
 * Durum yalnızca soldaki saat kutusunun rengi, küçük durum etiketi ve
 * kenarlık rengiyle anlatılır. Doz "Verildi" olarak kaydedildiğinde
 * kenarlık ve vurgu rengi yumuşak bir geçişle yeşile döner.
 */
function SwipeableDoseCardBase({ item, now, manual, qr, onManualConfirm, onScanQr, onOpen }: Props) {
  const { width } = useWindowDimensions();
  const cardWidth = width - CARD_LIST_PADDING * 2;
  const threshold = cardWidth * TRIGGER_RATIO;

  const translateX = useSharedValue(0);
  const armed = useSharedValue(0);
  const isDone = item.urgency === DoseUrgency.Done;
  const isLate = item.urgency === DoseUrgency.Overdue;
  const doneProgress = useSharedValue(isDone ? 1 : 0);

  useEffect(() => {
    doneProgress.value = withTiming(isDone ? 1 : 0, { duration: 450 });
  }, [isDone, doneProgress]);

  const rightEnabled = manual.enabled;
  const leftEnabled = qr.enabled;
  const idleBorder = isLate ? palette.overdueBorder : palette.border;

  const hapticTick = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  const hapticLocked = () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  const triggerManual = () => onManualConfirm(item);
  const triggerQr = () => onScanQr(item);
  const open = () => onOpen(item);

  const pan = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      const dx = e.translationX;
      const allowed = dx > 0 ? rightEnabled : leftEnabled;
      translateX.value = allowed ? dx : dx * LOCKED_RESISTANCE;

      const nextArmed = allowed && Math.abs(dx) > threshold ? Math.sign(dx) : 0;
      if (nextArmed !== armed.value) {
        armed.value = nextArmed;
        if (nextArmed !== 0) scheduleOnRN(hapticTick);
      }
    })
    .onEnd((e) => {
      const dx = e.translationX;
      const flung = Math.abs(e.velocityX) > FLING_VELOCITY && Math.sign(e.velocityX) === Math.sign(dx);
      const passed = Math.abs(dx) > threshold || flung;
      const allowed = dx > 0 ? rightEnabled : leftEnabled;

      translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
      armed.value = 0;

      if (!passed) return;
      if (!allowed) {
        scheduleOnRN(hapticLocked);
        return;
      }
      scheduleOnRN(dx > 0 ? triggerManual : triggerQr);
    });

  const tap = Gesture.Tap()
    .maxDuration(400)
    .onEnd((_e, success) => {
      if (success) scheduleOnRN(open);
    });

  const gesture = Gesture.Exclusive(pan, tap);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    borderColor: interpolateColor(doneProgress.value, [0, 1], [idleBorder, palette.doneBorder]),
  }));

  const accentStyle = useAnimatedStyle(() => {
    const idle = isLate ? palette.overdue : palette.neutralAccent;
    return { color: interpolateColor(doneProgress.value, [0, 1], [idle, palette.done]) };
  });

  const timeBoxStyle = useAnimatedStyle(() => {
    const idle = isLate ? `${palette.overdue}1F` : `${palette.neutralAccent}1F`;
    return { backgroundColor: interpolateColor(doneProgress.value, [0, 1], [idle, `${palette.done}1F`]) };
  });

  const underlayStyle = useAnimatedStyle(() => {
    const right = translateX.value > 0;
    const enabled = right ? rightEnabled : leftEnabled;
    return {
      backgroundColor: !enabled ? palette.swipeLocked : right ? palette.swipeConfirm : palette.swipeQr,
      opacity: interpolate(Math.abs(translateX.value), [0, 24], [0, 1], Extrapolation.CLAMP),
    };
  });

  const rightActionStyle = useAnimatedStyle(() => ({
    opacity: translateX.value > 0 ? 1 : 0,
  }));

  const leftActionStyle = useAnimatedStyle(() => ({
    opacity: translateX.value < 0 ? 1 : 0,
  }));

  const { dose } = item;
  const prescriber = dose.prescribedByName
    ? dose.prescribedByTitle
      ? `${dose.prescribedByName} - ${dose.prescribedByTitle}`
      : dose.prescribedByName
    : null;
  const accentIconColor = isDone ? palette.done : isLate ? palette.overdue : palette.neutralAccent;

  return (
    <View style={styles.wrapper}>
      <Animated.View style={[styles.underlay, underlayStyle]}>
        <Animated.View style={[styles.actionSide, rightActionStyle]}>
          {rightEnabled ? <CircleCheck size={24} color={palette.white} /> : <Lock size={22} color={palette.white} />}
          <Text style={styles.actionText}>{rightEnabled ? 'Verildi' : manual.reason ?? 'Kilitli'}</Text>
        </Animated.View>
        <Animated.View style={[styles.actionSide, leftActionStyle]}>
          <Text style={styles.actionText}>{leftEnabled ? 'QR ile Onayla' : qr.reason ?? 'Kilitli'}</Text>
          {leftEnabled ? <ScanQrCode size={24} color={palette.white} /> : <Lock size={22} color={palette.white} />}
        </Animated.View>
      </Animated.View>

      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.card, cardStyle]} accessibilityRole="button" accessibilityHint="Günlük planı açmak için dokunun">
          <View style={styles.row}>
            <Animated.View style={[styles.timeBox, timeBoxStyle]}>
              <Animated.Text style={[styles.time, accentStyle]}>{formatTime(dose.scheduledTime)}</Animated.Text>
              <Pill size={14} color={accentIconColor} />
            </Animated.View>

            <View style={styles.info}>
              <View style={styles.nameRow}>
                <Text style={styles.patient} numberOfLines={1}>
                  {dose.patientName}
                </Text>
                {isDone ? (
                  <StatusChip label="Verildi" color={palette.doneText} />
                ) : isLate ? (
                  <StatusChip label="Gecikti" color={palette.overdue} />
                ) : null}
              </View>

              <View style={styles.locationRow}>
                <MapPin size={14} color={palette.textSubtle} />
                <Text style={styles.location} numberOfLines={1}>
                  {formatLocation(dose)}
                </Text>
              </View>

              <Text style={styles.medication}>
                {dose.medicationName} - {dose.dosage}
              </Text>
              {prescriber ? (
                <Text style={styles.prescriber} numberOfLines={1}>
                  Reçete eden: {prescriber}
                </Text>
              ) : null}

              {isDone && dose.administeredAt ? (
                <View style={styles.auditRow}>
                  <CircleCheck size={15} color={palette.doneText} />
                  <Text style={styles.auditText} numberOfLines={1}>
                    Verildi {formatTime(dose.administeredAt)}
                    {dose.administeredByName ? ` · ${dose.administeredByName}` : ''}
                  </Text>
                </View>
              ) : null}

              {item.otherPendingCount > 0 || item.nextDoseAt ? (
                <View style={styles.hiddenRow}>
                  {item.otherPendingCount > 0 ? (
                    <Text style={styles.hiddenOverdue}>+{item.otherPendingCount} bekleyen doz daha</Text>
                  ) : null}
                  {item.nextDoseAt ? <Text style={styles.hiddenNext}>Sonraki doz {formatTime(item.nextDoseAt)}</Text> : null}
                </View>
              ) : null}
            </View>
          </View>

          {!isDone && dose.nurseNote ? (
            <View style={styles.note}>
              <TriangleAlert size={17} color={palette.noteIcon} />
              <Text style={styles.noteText}>{dose.nurseNote}</Text>
            </View>
          ) : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export const SwipeableDoseCard = memo(SwipeableDoseCardBase);

const styles = StyleSheet.create({
  wrapper: { marginVertical: 6 },
  underlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
  },
  actionSide: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actionText: { color: palette.white, fontSize: 16, fontWeight: '800' },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    ...shadow.card,
    paddingTop: 14,
    paddingBottom: 14,
    paddingLeft: spacing.lg,
    paddingRight: 14,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  timeBox: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  time: { fontSize: 14, fontWeight: '700' },
  info: { flex: 1, marginLeft: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  patient: { flex: 1, fontSize: 15.5, fontWeight: '700', color: palette.text },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  location: { flex: 1, fontSize: 12.5, color: palette.textSubtle },
  medication: { marginTop: 6, fontSize: 13.5, fontWeight: '600', color: palette.text },
  prescriber: { marginTop: 2, fontSize: 11.5, color: palette.textSubtle },
  auditRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  auditText: { flex: 1, fontSize: 12, fontWeight: '600', color: palette.doneText },
  hiddenRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, marginTop: 6 },
  hiddenOverdue: { fontSize: 12, fontWeight: '600', color: palette.overdueText },
  hiddenNext: { fontSize: 12, fontWeight: '600', color: palette.textSubtle },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: palette.noteBackground,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.noteBorder,
  },
  noteText: { flex: 1, fontSize: 12.5, lineHeight: 16, color: palette.noteText },
});
