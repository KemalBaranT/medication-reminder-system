import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'api_service.dart';

/// Data-only FCM mesajlarini kilit ekraninda gorunen, sesli, yuksek oncelikli
/// yerel bildirime cevirir. Data-only kullanmamizin nedeni: uygulama arka planda
/// veya kapaliyken bile bildirimin gorsel/ses davranisini biz kontrol edebiliyoruz.
class NotificationService {
  final _localNotifications = FlutterLocalNotificationsPlugin();
  final ApiService _api;

  NotificationService(this._api);

  static const _channel = AndroidNotificationChannel(
    'medication_due_channel',
    'İlaç Zamanı Bildirimleri',
    description: 'Zamanı gelen ilaçlar için kritik öncelikli bildirimler',
    importance: Importance.max,
    playSound: true,
  );

  Future<void> initialize() async {
    await _localNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_channel);

    await _localNotifications.initialize(
      const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(),
      ),
    );

    final messaging = FirebaseMessaging.instance;
    await messaging.requestPermission(alert: true, badge: true, sound: true);

    final token = await messaging.getToken();
    if (token != null) {
      await _api.registerDevice(token, 'android');
    }
    messaging.onTokenRefresh
        .listen((newToken) => _api.registerDevice(newToken, 'android'));

    FirebaseMessaging.onMessage.listen(_showLocalNotification);
  }

  Future<void> _showLocalNotification(RemoteMessage message) async {
    final data = message.data;
    if (data['type'] != 'medication_due' &&
        data['type'] != 'medication_missed') {
      return;
    }

    final title = data['type'] == 'medication_missed'
        ? 'İLAÇ KAÇIRILDI: ${data['patientName']}'
        : 'İlaç Zamanı: ${data['patientName']} (Oda ${data['roomNo']})';
    final body = '${data['medicationName']} - ${data['dosage'] ?? ''}';

    await _localNotifications.show(
      data['scheduleId'].hashCode,
      title,
      body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _channel.id,
          _channel.name,
          channelDescription: _channel.description,
          importance: Importance.max,
          priority: Priority.high,
          fullScreenIntent: true,
          category: AndroidNotificationCategory.alarm,
        ),
        iOS: const DarwinNotificationDetails(
          interruptionLevel: InterruptionLevel.timeSensitive,
          presentAlert: true,
          presentSound: true,
        ),
      ),
      payload: data['scheduleId'] as String?,
    );
  }
}

/// Uygulama tamamen kapaliyken gelen data mesajlarini isler (arka plan izolate'i).
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Burada agir is yapilmaz; sadece gerekiyorsa yerel bir bildirim tetiklenir.
  // main.dart'ta FirebaseMessaging.onBackgroundMessage ile kaydedilir.
}
