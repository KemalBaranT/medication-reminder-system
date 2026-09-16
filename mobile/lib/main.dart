import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:provider/provider.dart';
import 'services/api_service.dart';
import 'services/notification_service.dart';
import 'services/offline_queue_service.dart';
import 'state/app_state.dart';
import 'screens/login_screen.dart';
import 'screens/today_medications_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

  final apiService = ApiService();
  final notificationService = NotificationService(apiService);
  await notificationService.initialize();

  runApp(
    ChangeNotifierProvider(
      create: (_) => AppState(api: apiService, offlineQueue: OfflineQueueService(apiService)),
      child: const IlacTakipApp(),
    ),
  );
}

class IlacTakipApp extends StatelessWidget {
  const IlacTakipApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Ilac Takip',
      theme: ThemeData(colorSchemeSeed: Colors.blue, useMaterial3: true),
      // TODO: gercek oturum kontrolu icin baslangicta kayitli token kontrol edilebilir.
      home: context.watch<AppState>().isLoggedIn
          ? const TodayMedicationsScreen()
          : const LoginScreen(),
    );
  }
}
