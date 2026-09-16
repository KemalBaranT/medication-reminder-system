import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ApiService {
  // Gelistirme icin: Android emulator host makineye 10.0.2.2 ile erisir.
  // Gercek cihazda hastane ic agindaki backend adresini kullanin.
  static const String baseUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://10.0.2.2:3000',
  );

  final _storage = const FlutterSecureStorage();

  Future<String?> get _token => _storage.read(key: 'accessToken');

  Future<Map<String, String>> _headers() async {
    final token = await _token;
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  Future<Map<String, dynamic>> login(String email, String password) async {
    final res = await http.post(
      Uri.parse('$baseUrl/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );
    if (res.statusCode != 201 && res.statusCode != 200) {
      throw Exception('Giris basarisiz');
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    await _storage.write(key: 'accessToken', value: data['accessToken'] as String);
    return data;
  }

  Future<void> logout() => _storage.delete(key: 'accessToken');

  Future<List<dynamic>> fetchMySchedule() async {
    final res = await http.get(Uri.parse('$baseUrl/schedule/mine'), headers: await _headers());
    if (res.statusCode != 200) throw Exception('Liste alinamadi');
    return jsonDecode(res.body) as List<dynamic>;
  }

  Future<void> registerDevice(String fcmToken, String platform) async {
    await http.post(
      Uri.parse('$baseUrl/devices/register'),
      headers: await _headers(),
      body: jsonEncode({'fcmToken': fcmToken, 'platform': platform}),
    );
  }

  Future<void> submitLog({
    required String scheduleId,
    required String action,
    String? reason,
    required bool barcodeVerified,
    String? notes,
  }) async {
    final res = await http.post(
      Uri.parse('$baseUrl/administration-logs'),
      headers: await _headers(),
      body: jsonEncode({
        'scheduleId': scheduleId,
        'action': action,
        if (reason != null) 'reason': reason,
        'barcodeVerified': barcodeVerified,
        if (notes != null) 'notes': notes,
      }),
    );
    if (res.statusCode >= 300) {
      throw Exception('Kayit gonderilemedi: ${res.body}');
    }
  }
}
