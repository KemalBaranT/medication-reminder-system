import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider, useSession } from '../auth/SessionProvider';
import '../notifications/backgroundSync';
import { useDoseNotifications } from '../notifications/useDoseNotifications';
import { ScheduleProvider } from '../state/ScheduleProvider';
import { palette } from '../theme/tokens';

/**
 * Uygulamanın kök düzeni.
 *
 * Sağlayıcı sırası bilinçlidir: `GestureHandlerRootView` en dışta olmalıdır
 * ki kaydırma hareketleri modallar dahil tüm ağaçta çalışsın;
 * `ScheduleProvider` ise oturum durumunu okuduğu için `SessionProvider`'ın
 * içindedir.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <SessionProvider>
          <ScheduleProvider>
            <StatusBar style="dark" />
            <RootNavigator />
          </ScheduleProvider>
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Oturum durumuna göre erişilebilir rotaları belirler. Korumalı rotalar,
 * oturum yokken gezinme yığınında hiç bulunmaz; bu, derin bağlantıyla
 * (ör. `ilactakip://patient/WB-123`) açılan bir ekranın oturum açmadan
 * hasta verisi göstermesini yapısal olarak engeller.
 */
function RootNavigator() {
  const { status } = useSession();
  useDoseNotifications();

  if (status === 'restoring') {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  const signedIn = status === 'signedIn';
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: palette.background },
        headerStyle: { backgroundColor: palette.surface },
        headerShadowVisible: false,
        headerTintColor: palette.primary,
        headerTitleStyle: { color: palette.primary, fontSize: 18, fontWeight: '700' },
        headerBackTitle: 'Geri',
      }}
    >
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="patient/[code]" options={{ title: 'Günlük İlaç Planı' }} />
        <Stack.Screen
          name="scan/index"
          options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="scan/[scheduleId]"
          options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background },
});
