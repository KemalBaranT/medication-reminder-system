import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:provider/provider.dart';
import 'services/api_service.dart';
import 'services/notification_service.dart';
import 'services/offline_queue_service.dart';
import 'state/app_state.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';
import 'theme/app_theme.dart';

/// Uygulama giris noktasi ve baslangic sirasi.
///
/// Sira burada onemlidir: oturum geri yukleme [runApp]'tan once calisir;
/// boylece geri donen bir kullanici asla bir giris yanip sonmesi gormez.
/// Hastane markalamasi ve Firebase'e dayali iki servis (push bildirimleri,
/// arka plan mesaj isleme) ise ilk kareyi engellemeden basarisiz olmasina
/// veya zaman asimina ugramasina kasitli olarak izin verilir - bir klinik
/// is listesi uygulamasi, sonucunda push bildirimleri kisitlansa bile,
/// baglantisi olmayan veya yapilandirilmamis bir Firebase projesine sahip
/// bir seviste yine de acilabilmelidir.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final apiService = ApiService();
  final offlineQueueService = OfflineQueueService(apiService);
  final notificationService = NotificationService(apiService);

  final appState = AppState(api: apiService, offlineQueue: offlineQueueService);
  // Daha once kaydedilmis bir oturum varsa (guvenli depolamadaki token),
  // kullaniciyi tekrar giris yapmaya zorlamadan dogrudan ana ekrana al.
  await appState.restoreSession();
  // Hastane adi ag uzerinden geldigi icin uygulama acilisini bekletmiyoruz;
  // gelince ilgili ekranlar otomatik guncellenir.
  unawaited(appState.loadHospitalName());

  // Firebase ve bildirim servisleri baslangicta hata verirse veya asilirsa
  // uygulama beyaz ekranda kilitlenmesin diye try-catch + timeout ile,
  // runApp'i engellemeyecek sekilde calistiriliyor.
  await _initializeFirebase();
  await _initializeNotifications(notificationService);

  runApp(
    ChangeNotifierProvider.value(
      value: appState,
      child: const IlacTakipApp(),
    ),
  );
}

Future<void> _initializeFirebase() async {
  try {
    await Firebase.initializeApp().timeout(const Duration(seconds: 10));
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
  } catch (e, stackTrace) {
    // NOT: Projede henuz google-services.json / firebase_options.dart yok.
    // Bu yuzden Firebase baslatma su an basarisiz olabilir; bu durum artik
    // uygulamanin acilmasini engellemiyor. Push bildirimleri calismasi icin
    // `flutterfire configure` calistirilip gerekli dosyalar eklenmeli.
    if (kDebugMode) {
      debugPrint('Firebase baslatilamadi: $e');
      debugPrint('$stackTrace');
    }
  }
}

Future<void> _initializeNotifications(
    NotificationService notificationService) async {
  try {
    await notificationService.initialize().timeout(const Duration(seconds: 10));
  } catch (e, stackTrace) {
    if (kDebugMode) {
      debugPrint('Bildirim servisi baslatilamadi: $e');
      debugPrint('$stackTrace');
    }
  }
}

/// Kok widget: Material temasini baglar ve yalnizca [AppState.isLoggedIn]'e
/// gore [HomeScreen] veya [LoginScreen]'e yonlendirir; boylece oturum sonu
/// ([AppState.logout] icinde merkezi olarak islenir), hicbir acik navigasyon
/// cagrisi olmadan kullaniciyi giris ekranina geri dusurmek icin tek basina
/// yeterlidir.
class IlacTakipApp extends StatelessWidget {
  const IlacTakipApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'İlaç Takip',
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      home: context.watch<AppState>().isLoggedIn
          ? const HomeScreen()
          : const LoginScreen(),
    );
  }
}
