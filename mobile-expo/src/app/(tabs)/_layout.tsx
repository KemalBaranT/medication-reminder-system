import { router, Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBottomNavBar } from '../../components/AppBottomNavBar';
import { AppHeader } from '../../components/AppHeader';
import { QrScanFab } from '../../components/QrScanFab';
import { palette, spacing, TAB_BAR_HEIGHT } from '../../theme/tokens';

/**
 * Girişten sonraki ana kabuk: beyaz başlık, iki sekmeli alt menü
 * ("Bugünün İlaçları" ve "Hastalar") ve alt menünün hemen üstünde sağ
 * köşede duran "QR Tara" düğmesi.
 *
 * FAB, sekme çubuğunun içine değil bu kabuğun üstüne yerleştirilir:
 * Android, bir görünümün sınırları dışına taşan alt öğelere dokunma
 * olayı iletmez; çubuğun içine konulup yukarı taşırılan bir düğme
 * Android'de basılamaz hale gelirdi.
 */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <Tabs
        tabBar={(props) => <AppBottomNavBar {...props} />}
        screenOptions={{
          header: ({ options }) => <AppHeader title={options.title ?? ''} />,
          sceneStyle: { backgroundColor: palette.background },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Bugünün İlaçları' }} />
        <Tabs.Screen name="patients" options={{ title: 'Hastalar' }} />
      </Tabs>
      <QrScanFab bottom={TAB_BAR_HEIGHT + insets.bottom + spacing.lg} onPress={() => router.push('/scan')} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
});
