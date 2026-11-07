import { CameraView, scanFromURLAsync, useCameraPermissions, type BarcodeType } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { CameraOff, Flashlight, FlashlightOff, ImageUp } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeOutDown,
  cancelAnimation,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { palette, radius, spacing, typography } from '../theme/tokens';

/**
 * Okunan kodun kaynağı. Denetim kaydı için önemlidir: galerideki bir
 * fotoğraf, hemşirenin o an yatak başında olduğunu kanıtlamaz; bu yüzden
 * galeriden okunan kodlar "barkod doğrulamalı" kayıt sayılmaz.
 */
export type ScanSource = 'camera' | 'gallery';

/** Ekranın okunan bir koda verdiği yanıt; vizör görsel geri bildirimi buna göre yönetir. */
export type ScanDecision =
  | { kind: 'accept'; message: string }
  | { kind: 'complete'; message: string }
  | { kind: 'reject'; message: string };

interface Props {
  /** Vizörün üstünde gösterilen, o anki adımı anlatan başlık. */
  instruction: string;
  /** Kodu iş kuralına göre değerlendirir. */
  onCode: (code: string, source: ScanSource) => Promise<ScanDecision>;
  /** Tarama tamamlandıktan sonra yeni kod kabul edilmez. */
  paused?: boolean;
}

/**
 * Hasta bilekliklerinde QR, ilaç ambalajlarında ise çoğunlukla doğrusal
 * barkod bulunur; iki tür de desteklenir. iOS'ta galeriden okuma yalnızca
 * QR destekler (platform kısıtı).
 */
const BARCODE_TYPES: BarcodeType[] = ['qr', 'code128', 'code39', 'ean13', 'ean8', 'upc_a', 'datamatrix'];

/** Aynı reddedilmiş kodun hata bandını tekrar tetiklemeden önce beklenecek süre. */
const REJECT_COOLDOWN_MS = 2_000;

type Feedback = { tone: 'success' | 'error'; message: string } | null;

/**
 * Gelişmiş QR/barkod okuyucu: canlı kamera, galeriden okuma, fener ve
 * Reanimated ile çalışan lazer tarama animasyonu.
 *
 * **Lazer rengi bir durum göstergesidir:** Tarama sürerken yeşil lazer
 * vizör içinde yukarı-aşağı hareket eder. Reddedilen bir kodda lazer ve
 * çerçeve kırmızıya döner ve kısa bir titreşim verilir; kabul edilen kodda
 * yeşil parlar. Hemşire, sonucu metni okumadan da göz ucuyla anlar.
 *
 * **Tekrarlı okuma koruması:** Kamera aynı kodu saniyede onlarca kez
 * bildirir. Bir kod değerlendirilirken yeni kodlar yok sayılır ve az önce
 * reddedilen kod kısa bir süre tekrar değerlendirilmez; aksi halde hata
 * bandı ve titreşim art arda tetiklenirdi.
 */
export function QrScannerView({ instruction, onCode, paused = false }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const { width } = useWindowDimensions();
  const frameSize = Math.min(width * 0.72, 300);

  const processingRef = useRef(false);
  const lastRejectRef = useRef<{ code: string; at: number } | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const laserY = useSharedValue(0);
  const tone = useSharedValue(0);

  useEffect(() => {
    laserY.value = 0;
    laserY.value = withRepeat(withTiming(frameSize - 4, { duration: 1700, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(laserY);
  }, [frameSize, laserY]);

  useEffect(() => () => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
  }, []);

  const showFeedback = useCallback(
    (next: Feedback) => {
      setFeedback(next);
      if (next?.tone === 'error') {
        tone.value = withSequence(withTiming(1, { duration: 120 }), withTiming(1, { duration: 1400 }), withTiming(0, { duration: 400 }));
      } else if (next?.tone === 'success') {
        tone.value = withSequence(withTiming(-1, { duration: 120 }), withTiming(-1, { duration: 900 }), withTiming(0, { duration: 400 }));
      }
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
      feedbackTimer.current = setTimeout(() => setFeedback(null), 2_400);
    },
    [tone],
  );

  const handleCode = useCallback(
    async (raw: string, source: ScanSource) => {
      const code = raw.trim();
      if (!code || processingRef.current || paused) return;
      const lastReject = lastRejectRef.current;
      if (lastReject && lastReject.code === code && Date.now() - lastReject.at < REJECT_COOLDOWN_MS) return;

      processingRef.current = true;
      setBusy(true);
      try {
        const decision = await onCode(code, source);
        if (decision.kind === 'reject') {
          lastRejectRef.current = { code, at: Date.now() };
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          showFeedback({ tone: 'error', message: decision.message });
        } else {
          lastRejectRef.current = null;
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showFeedback({ tone: 'success', message: decision.message });
        }
      } finally {
        processingRef.current = false;
        setBusy(false);
      }
    },
    [onCode, paused, showFeedback],
  );

  const pickFromGallery = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled || result.assets.length === 0) return;
    setBusy(true);
    try {
      const found = await scanFromURLAsync(result.assets[0].uri, BARCODE_TYPES);
      if (found.length === 0) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        showFeedback({ tone: 'error', message: 'Seçilen görselde okunabilir bir QR kod bulunamadı.' });
        return;
      }
      setBusy(false);
      await handleCode(found[0].data, 'gallery');
    } catch {
      showFeedback({ tone: 'error', message: 'Görsel okunamadı. Farklı bir fotoğraf deneyin.' });
    } finally {
      setBusy(false);
    }
  }, [handleCode, showFeedback]);

  const laserStyle = useAnimatedStyle(() => {
    const color = interpolateColor(tone.value, [-1, 0, 1], [palette.laserIdle, palette.laserIdle, palette.laserError]);
    return {
      transform: [{ translateY: laserY.value }],
      backgroundColor: color,
      shadowColor: color,
    };
  });

  const frameStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(tone.value, [-1, 0, 1], [palette.laserIdle, 'rgba(255,255,255,0.9)', palette.laserError]),
  }));

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={palette.white} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <CameraOff size={42} color={palette.white} />
        <Text style={styles.permissionTitle}>Kamera izni gerekiyor</Text>
        <Text style={styles.permissionText}>
          Hasta bilekliğini ve ilaç barkodunu okutabilmek için kameraya erişim izni verin. Dilerseniz galeriden bir fotoğraf da
          seçebilirsiniz.
        </Text>
        <View style={styles.permissionActions}>
          {permission.canAskAgain ? (
            <Pressable style={styles.permissionButton} onPress={requestPermission}>
              <Text style={styles.permissionButtonText}>İzin Ver</Text>
            </Pressable>
          ) : null}
          <Pressable style={[styles.permissionButton, styles.secondaryButton]} onPress={pickFromGallery}>
            <Text style={styles.permissionButtonText}>Galeriden Seç</Text>
          </Pressable>
        </View>
        {feedback ? <Text style={styles.permissionError}>{feedback.message}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
        onBarcodeScanned={paused ? undefined : (r) => void handleCode(r.data, 'camera')}
      />

      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.mask} />
        <View style={{ flexDirection: 'row', height: frameSize }}>
          <View style={styles.mask} />
          <Animated.View style={[styles.frame, { width: frameSize, height: frameSize }, frameStyle]}>
            <Animated.View style={[styles.laser, laserStyle]} />
          </Animated.View>
          <View style={styles.mask} />
        </View>
        <View style={[styles.mask, styles.instructionArea]}>
          <Text style={styles.instruction}>{instruction}</Text>
          {busy ? <ActivityIndicator color={palette.white} style={{ marginTop: spacing.md }} /> : null}
        </View>
      </View>

      {feedback ? (
        <Animated.View
          key={feedback.message}
          entering={FadeInDown.springify().damping(16)}
          exiting={FadeOutDown}
          style={[styles.toast, { backgroundColor: feedback.tone === 'error' ? palette.laserError : palette.done }]}
        >
          <Text style={styles.toastText}>{feedback.message}</Text>
        </Animated.View>
      ) : null}

      <View style={styles.controls}>
        <ControlButton label={torch ? 'Feneri Kapat' : 'Fener'} onPress={() => setTorch((t) => !t)}>
          {torch ? <FlashlightOff size={22} color={palette.white} /> : <Flashlight size={22} color={palette.white} />}
        </ControlButton>
        <ControlButton label="Galeriden Oku" onPress={pickFromGallery}>
          <ImageUp size={22} color={palette.white} />
        </ControlButton>
      </View>
    </View>
  );
}

function ControlButton({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.control, pressed && { opacity: 0.7 }]} accessibilityLabel={label}>
      {children}
      <Text style={styles.controlText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.black },
  center: { flex: 1, backgroundColor: '#0B1220', alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  mask: { flex: 1, backgroundColor: palette.scannerBackdrop },
  frame: { borderWidth: 2, borderRadius: radius.md, overflow: 'hidden' },
  laser: {
    height: 3,
    marginHorizontal: spacing.sm,
    borderRadius: 2,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  instructionArea: { alignItems: 'center', paddingTop: spacing.xl, paddingHorizontal: spacing.xl },
  instruction: { ...typography.body, color: palette.white, textAlign: 'center', fontWeight: '600' },
  toast: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: 130,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  toastText: { ...typography.body, color: palette.white, textAlign: 'center', fontWeight: '700' },
  controls: {
    position: 'absolute',
    bottom: spacing.xxl,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  control: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    minWidth: 120,
  },
  controlText: { ...typography.caption, color: palette.white },
  permissionTitle: { ...typography.heading, color: palette.white },
  permissionText: { ...typography.body, color: '#CBD5E1', textAlign: 'center', lineHeight: 22 },
  permissionActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  permissionButton: { backgroundColor: palette.primary, borderRadius: radius.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  secondaryButton: { backgroundColor: 'rgba(255,255,255,0.16)' },
  permissionButtonText: { ...typography.body, color: palette.white, fontWeight: '700' },
  permissionError: { ...typography.caption, color: palette.laserError, textAlign: 'center' },
});
