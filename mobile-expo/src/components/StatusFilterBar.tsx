import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { palette, radius, spacing } from '../theme/tokens';

/**
 * "Bugünün İlaçları" listesinin daraltılabileceği durum kategorileri.
 *
 * Backend'in `ScheduleStatus` enum'unun birebir yansıması değil, arayüz
 * seviyesinde bir gruplamadır: "Gecikti" ve "Bekliyor" aynı sunucu
 * durumundan (`pending`/`notified`) gelir ve saate göre ayrılır, çünkü
 * "gecikmiş" kayıtlı bir durum değil, o anki zamanın bir fonksiyonudur.
 */
export type StatusFilter = 'all' | 'late' | 'pending' | 'administered';

const FILTERS: { key: StatusFilter; label: string; color: string }[] = [
  // "Tümü" marka kırmızısı yerine nötr grafit tonundadır; marka rengi
  // "Gecikti" çipiyle aynı renge denk gelip ikisini ayırt edilemez yapardı.
  { key: 'all', label: 'Tümü', color: palette.neutralAccent },
  { key: 'late', label: 'Gecikti', color: palette.overdue },
  { key: 'pending', label: 'Bekliyor', color: palette.due },
  { key: 'administered', label: 'Verildi', color: palette.done },
];

interface Props {
  selected: StatusFilter;
  onChange: (filter: StatusFilter) => void;
}

/**
 * Renk kodlu, hap şeklindeki durum filtresi çipleri. Seçili çip dolu
 * renkte, diğerleri kendi renginin açık tonunda gösterilir. Durumsuz bir
 * seçicidir; seçili filtre ekranın kendi durumunda tutulur.
 */
export function StatusFilterBar({ selected, onChange }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroll}>
      {FILTERS.map(({ key, label, color }) => {
        const active = key === selected;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            style={[styles.chip, { backgroundColor: active ? color : `${color}1A` }]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.label, { color: active ? palette.white : color }]}>{label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, marginVertical: spacing.xs },
  row: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: 'center', height: 42 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill },
  label: { fontSize: 12.5, fontWeight: '700' },
});
