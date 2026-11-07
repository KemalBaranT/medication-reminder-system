import { CloudOff, RefreshCw, type LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { palette, radius, spacing } from '../theme/tokens';

/**
 * Tüm liste ekranlarında ortak kullanılan yükleniyor / boş / hata
 * görünümleri. Aynı durumun her ekranda aynı görünmesi, hemşirenin "liste
 * boş mu, filtre mi daraltıyor, bağlantı mı koptu" ayrımını tek bakışta
 * yapmasını sağlar.
 */
export function LoadingView() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={palette.primary} />
    </View>
  );
}

export function EmptyView({ icon: Icon, message }: { icon: LucideIcon; message: string }) {
  return (
    <View style={styles.center}>
      <Icon size={56} color={palette.textSubtle} strokeWidth={1.6} />
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.center}>
      <CloudOff size={56} color={palette.overdue} strokeWidth={1.6} />
      <Text style={styles.errorText}>{message}</Text>
      <Pressable style={({ pressed }) => [styles.retry, pressed && { opacity: 0.85 }]} onPress={onRetry}>
        <RefreshCw size={18} color={palette.onPrimary} />
        <Text style={styles.retryText}>Tekrar Dene</Text>
      </Pressable>
    </View>
  );
}

/** Rol/durum bilgisini gösteren küçük hap etiketi. */
export function StatusChip({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: `${color}1F` }]}>
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, minHeight: 320 },
  emptyText: { marginTop: spacing.md, fontSize: 15, color: palette.textSubtle, textAlign: 'center' },
  errorText: { marginTop: spacing.md, fontSize: 15, color: palette.text, textAlign: 'center' },
  retry: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    height: 48,
  },
  retryText: { color: palette.onPrimary, fontSize: 15, fontWeight: '600' },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  chipText: { fontSize: 12, fontWeight: '600' },
});
