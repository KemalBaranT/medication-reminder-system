import { LogOut, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { roleLabels } from '../auth/permissions';
import { useSession } from '../auth/SessionProvider';
import { palette, radius, shadow, spacing } from '../theme/tokens';

/**
 * Ana sekmelerin ortak başlığı: etkin sekmenin adı ve altında küçük gri
 * yazıyla hastane adı; sağda hesap avatarı.
 *
 * Hesap bilgisi ve çıkış işlemi ayrı bir ekran yerine avatarın açtığı
 * menüde yaşar; böylece alt menü uygulamadaki tek gezinme yüzeyi olarak
 * kalır.
 *
 * **God Mode göstergesi:** Super Admin oturumunda avatarın yanında
 * yalnızca küçük bir kalkan ikonu görünür. Geçersiz kılma arka planda
 * tamamen çalışır; gösterge, ekran düzenini değiştirmeden bir test
 * hesabının açık bırakıldığını fark ettirmeye yeter.
 */
export function AppHeader({ title }: { title: string }) {
  const { user, permissions, hospitalName, signOut } = useSession();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const initial = user?.fullName.trim().charAt(0).toLocaleUpperCase('tr-TR') || '?';
  const displayName = user?.title ? `${user.fullName} - ${user.title}` : user?.fullName;

  return (
    <View style={[styles.bar, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {hospitalName}
          </Text>
        </View>
        {permissions.godMode ? (
          <ShieldCheck size={18} color={palette.godMode} accessibilityLabel="God Mode etkin" style={styles.shield} />
        ) : null}
        <Pressable onPress={() => setMenuOpen(true)} hitSlop={8} accessibilityLabel="Hesap">
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
        </Pressable>
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)}>
          <View style={[styles.menu, { top: insets.top + 54 }]}>
            <Text style={styles.menuName}>{displayName}</Text>
            <Text style={styles.menuRole}>{user ? roleLabels[user.role] : ''}</Text>
            <View style={styles.divider} />
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: palette.background }]}
              onPress={() => {
                setMenuOpen(false);
                void signOut();
              }}
            >
              <LogOut size={19} color={palette.text} />
              <Text style={styles.menuItemText}>Çıkış yap</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: palette.surface },
  row: { flexDirection: 'row', alignItems: 'center', height: 60, paddingLeft: spacing.lg, paddingRight: spacing.md },
  title: { fontSize: 18, fontWeight: '700', color: palette.primary },
  subtitle: { fontSize: 11, fontWeight: '500', color: palette.textMuted, marginTop: 1 },
  shield: { marginRight: spacing.sm },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 13, fontWeight: '700', color: palette.onSecondaryContainer },
  menu: {
    position: 'absolute',
    right: spacing.md,
    minWidth: 220,
    backgroundColor: palette.surface,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    ...shadow.fab,
  },
  menuName: { fontSize: 14, fontWeight: '700', color: palette.text, paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  menuRole: { fontSize: 12.5, color: palette.textSubtle, paddingHorizontal: spacing.lg, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.border, marginVertical: spacing.sm },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.lg, height: 44 },
  menuItemText: { fontSize: 15, color: palette.text },
});
