import { router } from 'expo-router';
import { X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette, spacing, typography } from '../theme/tokens';

interface Props {
  title: string;
  subtitle?: string;
  /** Başlığın altında gösterilen ek öğeler (ör. doğrulama adımları). */
  children?: ReactNode;
}

/**
 * Tarama ekranlarının kamera görüntüsünün üstünde yüzen başlık çubuğu.
 * Bileklik tarama (FAB) ve doza bağlı QR doğrulama ekranları aynı
 * çubuğu kullanır; kapatma düğmesi her zaman aynı yerdedir.
 */
export function ScannerHeader({ title, subtitle, children }: Props) {
  return (
    <SafeAreaView style={styles.overlay} edges={['top']} pointerEvents="box-none">
      <View style={styles.bar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Pressable onPress={() => router.back()} style={styles.close} accessibilityLabel="Kapat" hitSlop={10}>
          <X size={22} color={palette.white} />
        </Pressable>
      </View>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: spacing.lg, gap: spacing.md },
  bar: { flexDirection: 'row', alignItems: 'center', paddingTop: spacing.sm },
  title: { fontSize: 18, fontWeight: '700', color: palette.white },
  subtitle: { ...typography.caption, color: '#CBD5E1', marginTop: 2 },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
