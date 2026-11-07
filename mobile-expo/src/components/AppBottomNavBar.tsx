import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pill, UsersRound, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette, spacing, TAB_BAR_HEIGHT } from '../theme/tokens';

/** Rota adı → sekme ikonu. Rota adları `src/app/(tabs)/` altındaki dosya adlarıdır. */
const ICONS: Record<string, LucideIcon> = {
  index: Pill,
  patients: UsersRound,
};

/**
 * Uygulamanın kalıcı alt gezinme çubuğu.
 *
 * Material 3 gezinme çubuğunun görünümünü (seçili ikonun arkasındaki hap
 * göstergesi, kalın seçili etiket) yeniden uygular; önceki Flutter
 * istemcisindeki `AppBottomNavBar` ile birebir aynıdır. Her rol aynı iki
 * sekmeyi görür: iş listesinin kapsamını (hemşire kendi dozları, diğer
 * roller servis geneli) backend belirler, sekmenin görünürlüğünü değil.
 */
export function AppBottomNavBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
      <View style={styles.row}>
        {state.routes.map((route, index) => {
          const selected = state.index === index;
          const label = descriptors[route.key].options.title ?? route.name;
          const Icon = ICONS[route.name] ?? Pill;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!selected && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={styles.item}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={label}
            >
              <View style={[styles.indicator, selected && styles.indicatorActive]}>
                <Icon size={22} color={selected ? palette.onSecondaryContainer : palette.textMuted} />
              </View>
              <Text style={[styles.label, selected && styles.labelActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: palette.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
  row: { flexDirection: 'row', height: TAB_BAR_HEIGHT },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  indicator: { paddingHorizontal: 20, paddingVertical: 4, borderRadius: 16 },
  indicatorActive: { backgroundColor: palette.secondaryContainer },
  label: { marginTop: spacing.xs, fontSize: 12, fontWeight: '600', color: palette.textMuted },
  labelActive: { fontWeight: '700', color: palette.text },
});
