import { Search, X } from 'lucide-react-native';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { palette, radius, shadow, spacing } from '../theme/tokens';

interface Props {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}

/**
 * Liste ekranlarının üstündeki yüzen, gölgeli arama alanı.
 *
 * Tamamen sunum amaçlıdır ve kendi filtreleme mantığı yoktur: "eşleşme"nin
 * ne anlama geldiğine (hasta adı, protokol numarası, ilaç adı) sahip ekran
 * karar verir. Böylece aynı bileşen hem iş listesinde hem hasta listesinde,
 * filtreleme kuralları bu dosyaya sızmadan kullanılır. Sıradan bir form
 * alanı gibi değil, belirgin bir arama affordance'ı gibi okunması için
 * beyaz zemin, yumuşak gölge ve kenarlıksız görünüm kullanır.
 */
export function SmartSearchBar({ value, onChangeText, placeholder }: Props) {
  return (
    <View style={styles.container}>
      <Search size={22} color={palette.textSubtle} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.textSubtle}
        returnKeyType="search"
        autoCorrect={false}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={10} accessibilityLabel="Temizle">
          <X size={20} color={palette.textSubtle} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.lg,
    height: 52,
    backgroundColor: palette.surface,
    borderRadius: radius.lg - 2,
    ...shadow.floating,
  },
  input: { flex: 1, fontSize: 16, color: palette.text, height: '100%' },
});
