import { ScanQrCode } from 'lucide-react-native';
import { Pressable, StyleSheet, Text } from 'react-native';

import { palette, shadow, spacing } from '../theme/tokens';

/**
 * Bileklik taramanın tek, global giriş noktası.
 *
 * Alt menünün hemen üstünde, sağ köşede sabit durur; kullanıcı hangi
 * sekmede olursa olsun tarayıcıyı hep aynı yerde bulur. Marka kırmızısıyla
 * uygulamadaki en belirgin eylemdir. Belirli bir doza bağlı QR doğrulaması
 * ise kartı sola kaydırarak açılır.
 */
export function QrScanFab({ onPress, bottom }: { onPress: () => void; bottom: number }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.fab, { bottom }, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
      accessibilityRole="button"
      accessibilityLabel="QR Tara"
    >
      <ScanQrCode size={22} color={palette.onPrimary} strokeWidth={2.2} />
      <Text style={styles.label}>QR Tara</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing.lg,
    height: 56,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: palette.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    ...shadow.fab,
  },
  label: { fontSize: 15, fontWeight: '700', color: palette.onPrimary },
});
