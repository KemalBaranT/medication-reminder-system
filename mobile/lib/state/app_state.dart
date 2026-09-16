import 'package:flutter/foundation.dart';
import '../models/medication_schedule.dart';
import '../services/api_service.dart';
import '../services/offline_queue_service.dart';

class AppState extends ChangeNotifier {
  final ApiService api;
  final OfflineQueueService offlineQueue;

  AppState({required this.api, required this.offlineQueue});

  bool isLoggedIn = false;
  List<MedicationSchedule> schedules = [];
  bool isLoading = false;
  String? error;

  Future<void> login(String email, String password) async {
    await api.login(email, password);
    isLoggedIn = true;
    notifyListeners();
  }

  Future<void> logout() async {
    await api.logout();
    isLoggedIn = false;
    schedules = [];
    notifyListeners();
  }

  Future<void> refreshSchedule() async {
    isLoading = true;
    error = null;
    notifyListeners();
    try {
      await offlineQueue.trySyncPending();
      final raw = await api.fetchMySchedule();
      schedules = raw
          .map((e) => MedicationSchedule.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      error = 'Liste yuklenemedi: baglantiyi kontrol edin';
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<void> submitFeedback({
    required String scheduleId,
    required String action,
    String? reason,
    required bool barcodeVerified,
    String? notes,
  }) async {
    final payload = {
      'scheduleId': scheduleId,
      'action': action,
      'reason': reason,
      'barcodeVerified': barcodeVerified,
      'notes': notes,
    };
    try {
      await api.submitLog(
        scheduleId: scheduleId,
        action: action,
        reason: reason,
        barcodeVerified: barcodeVerified,
        notes: notes,
      );
    } catch (_) {
      // Sunucuya ulasilamadi: internet gelince gonderilmek uzere yerelde sakla.
      await offlineQueue.enqueue(payload);
    }
    schedules.removeWhere((s) => s.id == scheduleId);
    notifyListeners();
  }
}
