import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// API'den donen hatalari, statusCode bilgisiyle birlikte tasiyan ozel
/// exception. AppState bu sayede gecersiz/suresi dolmus oturumla (401
/// Unauthorized ya da 403 Forbidden - backend'in RolesGuard'i, JWT gecerli
/// olsa bile beklenmeyen bir rol payload'iyla karsilastiginda ikincisini
/// dondurur) baglanti hatalarini birbirinden ayirt edip farkli davranabilir.
class ApiException implements Exception {
  final String message;
  final int? statusCode;

  ApiException(this.message, {this.statusCode});

  /// Sunucunun kimligi/oturumu artik gecerli kabul etmedigini belirtir.
  /// Cagiran taraf (AppState) bu durumda kullaniciyi otomatik cikis
  /// yaptirip giris ekranina yonlendirir; 403'u de kapsar, cunku bu
  /// uygulamada rol kisitlamalari sabit menu/aksiyonlarla eslestigi icin
  /// pratikte yalnizca tutarsiz/gecersiz bir oturumda ortaya cikar.
  bool get isSessionExpired => statusCode == 401 || statusCode == 403;

  @override
  String toString() => message;
}

/// Tum backend isteklerinin gectigi tek nokta. Token ekleme, zaman asimi ve
/// hata donusumu burada merkezi olarak yapilir; ekranlar sadece sonucu
/// veya ApiException'i isler.
class ApiService {
  // Gelistirme icin: Android emulator host makineye 10.0.2.2 ile erisir.
  // Web'de calistirilirsa (flutter run -d chrome) localhost kullanilir.
  // Gercek cihazda hastane ic agindaki backend adresini --dart-define ile verin:
  //   flutter run --dart-define=API_URL=http://192.168.1.50:3000
  static const String _configuredUrl = String.fromEnvironment('API_URL');
  static String get baseUrl {
    if (_configuredUrl.isNotEmpty) return _configuredUrl;
    return kIsWeb ? 'http://localhost:3000' : 'http://10.0.2.2:3000';
  }

  static const _requestTimeout = Duration(seconds: 12);

  final _storage = const FlutterSecureStorage();

  /// Ayni anda tetiklenen birden fazla 401, tek bir /auth/refresh cagrisini
  /// paylasir. Bu olmadan, iki ekran ayni anda suresi dolmus token ile
  /// istek atarsa ikisi de bagimsiz refresh dener; backend refresh
  /// token'lari her kullanimda rotate ettigi icin (bkz.
  /// AuthService.refresh) ikinci cagri ilk cagrinin zaten tukettigi
  /// token'i kullanmaya calisir ve gereksiz yere basarisiz olur - bu da
  /// kullaniciyi gercekte gecerli bir oturumdan haksiz yere cikarirdi.
  Future<bool>? _refreshInFlight;

  Future<String?> get _token => _storage.read(key: 'accessToken');

  Future<Map<String, String>> _headers() async {
    final token = await _token;
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  Future<bool> hasStoredSession() async {
    final token = await _token;
    return token != null && token.isNotEmpty;
  }

  Future<Map<String, dynamic>?> getStoredUser() async {
    final raw = await _storage.read(key: 'authUser');
    if (raw == null) return null;
    return jsonDecode(raw) as Map<String, dynamic>;
  }

  /// Kimlik dogrular ve donen access+refresh token ciftini ile kullanici
  /// profilini guvenli depolamaya yazar; sonraki tum istekler access
  /// token'i otomatik olarak Authorization basligina ekler (bkz.
  /// [_headers]). `allowRefresh: false` ile cagrilir, cunku bu istek zaten
  /// bir oturum acmaya calisiyor - yanlis sifreden gelen 401'i sessiz
  /// yenileme mantigina sokmak (bkz. [_send]) hem anlamsizdir hem de
  /// kullaniciya gosterilmesi gereken "E-posta veya sifre hatali" hatasini
  /// gizler.
  Future<Map<String, dynamic>> login(String email, String password) async {
    final data = await _send(
      () => http.post(
        Uri.parse('$baseUrl/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'email': email, 'password': password}),
      ),
      unauthorizedMessage: 'E-posta veya şifre hatalı',
      allowRefresh: false,
    );
    final map = data as Map<String, dynamic>;
    await _storage.write(
        key: 'accessToken', value: map['accessToken'] as String);
    await _storage.write(
        key: 'refreshToken', value: map['refreshToken'] as String);
    await _storage.write(key: 'authUser', value: jsonEncode(map['user']));
    return map;
  }

  /// Oturumu kapatir. Once sunucudan refresh token'in iptalini ister
  /// (best-effort - baglanti yoksa sessizce yutulur, cunku cihazdaki
  /// oturumu temizlemek internet olmadan da calismalidir), ardindan
  /// cihazdaki kopyalari siler. Sunucu tarafi iptal olmadan yalnizca
  /// yerel silme yeterli olmazdi: refresh token backend'de gecerli
  /// kaldigi surece, calinmis bir cihaz "cikis yapilmis" gorunse bile
  /// /auth/refresh ile sessizce oturumu canlandirabilirdi.
  Future<void> logout() async {
    final refreshToken = await _storage.read(key: 'refreshToken');
    if (refreshToken != null) {
      try {
        await http
            .post(
              Uri.parse('$baseUrl/auth/logout'),
              headers: {'Content-Type': 'application/json'},
              body: jsonEncode({'refreshToken': refreshToken}),
            )
            .timeout(_requestTimeout);
      } catch (_) {
        // Sunucuya ulasilamadi: yerel oturum yine de kapatilir, token
        // kendi suresi (REFRESH_TOKEN_EXPIRES_IN_DAYS) sonunda dogal
        // olarak gecersiz kalir.
      }
    }
    await _storage.delete(key: 'accessToken');
    await _storage.delete(key: 'refreshToken');
    await _storage.delete(key: 'authUser');
  }

  /// Oturumdaki hemsirenin "Bugunun Ilaclari" listesini ceker: kendisine
  /// atanmis veya henuz kimseye atanmamis bekleyen dozlar.
  Future<List<dynamic>> fetchMySchedule() async {
    final data = await _send(
      () async => http.get(Uri.parse('$baseUrl/schedule/mine'),
          headers: await _headers()),
    );
    return data as List<dynamic>;
  }

  /// "Hastalar" sekmesi icin servisteki tum hasta listesini ceker.
  Future<List<dynamic>> fetchPatients() async {
    final data = await _send(
      () async =>
          http.get(Uri.parse('$baseUrl/patients'), headers: await _headers()),
    );
    return data as List<dynamic>;
  }

  /// Bir hastanin recete/ilac gecmisini ceker; [PatientDetailScreen]'in
  /// "Recete / Ilaclar" bolumunu besler. `/patients/wristband/:code` gibi
  /// bu da role gore kisitlanmamistir - herhangi bir personel bir hastanin
  /// dosyasini goruntuleyebilir, yalniz duzenleme web panelinden yapilir.
  Future<List<dynamic>> fetchPrescriptionsForPatient(String patientId) async {
    final data = await _send(
      () async => http.get(
          Uri.parse('$baseUrl/prescriptions/patient/$patientId'),
          headers: await _headers()),
    );
    return data as List<dynamic>;
  }

  /// Bir hasta bilekligi taranip QR'dan okunan kod backend'e sorularak
  /// hastayi bulur. Backend hicbir role kisitlamasi koymaz (sadece giris
  /// yapmis olmak yeter), cunku bu, herhangi bir personelin bedbasi kimlik
  /// dogrulamasi yapmasina izin veren genel amacli bir bakis - dozla iliskili
  /// [submitLog] gibi hemsireye ozel bir yazma islemi degil. Eslesen hasta
  /// yoksa backend 404 doner; bu, [ApiException.statusCode] uzerinden
  /// cagiran taraf (WristbandScanScreen) tarafindan ayrica ele alinir.
  Future<Map<String, dynamic>> fetchPatientByWristband(String code) async {
    final data = await _send(
      () async => http.get(Uri.parse('$baseUrl/patients/wristband/$code'),
          headers: await _headers()),
    );
    return data as Map<String, dynamic>;
  }

  /// Kimlik dogrulama gerektirmez; giris ekraninda bile hastane adini
  /// gosterebilmek icin ayri tutulur.
  Future<String> fetchHospitalName() async {
    final data = await _send(
      () async => http.get(Uri.parse('$baseUrl/settings')),
    );
    final map = data as Map<String, dynamic>;
    return map['hospitalName'] as String;
  }

  /// Bu cihazin FCM push token'ini backend'e kaydeder. Hata sessizce
  /// yutulur: kayit basarisiz olursa bu cihaz push bildirimi almaz, ama bu
  /// uygulamanin geri kalanini durduracak kritiklikte bir hata degildir.
  Future<void> registerDevice(String fcmToken, String platform) async {
    try {
      await _send(
        () async => http.post(
          Uri.parse('$baseUrl/devices/register'),
          headers: await _headers(),
          body: jsonEncode({'fcmToken': fcmToken, 'platform': platform}),
        ),
      );
    } catch (_) {
      return;
    }
  }

  /// Hemsirenin bir doz icin verdigi uygulandi/uygulanmadi kararini
  /// sunucuya gonderir. Baglanti hatasi burada yakalanmaz; cagiran taraf
  /// ([AppState.submitFeedback]) bunu offline kuyruga almak icin kullanir.
  ///
  /// Yanit, sunucunun olusturdugu denetim kaydidir (`performedAt`,
  /// `performedByName`, `scheduleStatus`); istemci karti bu degerlerle
  /// aninda "Verildi" olarak gunceller. Doz zaten kapatilmissa sunucu 409
  /// doner (bkz. AdministrationLogsService.create).
  ///
  /// [performedAt] yalnizca cevrimdisi kuyruktan gec gonderilen kayitlarda
  /// verilir; denetim kaydinin gonderim anini degil, kararin verildigi ani
  /// tasimasini saglar.
  Future<Map<String, dynamic>> submitLog({
    required String scheduleId,
    required String action,
    String? reason,
    required bool barcodeVerified,
    String? notes,
    DateTime? performedAt,
  }) async {
    final data = await _send(
      () async => http.post(
        Uri.parse('$baseUrl/administration-logs'),
        headers: await _headers(),
        body: jsonEncode({
          'scheduleId': scheduleId,
          'action': action,
          if (reason != null) 'reason': reason,
          'barcodeVerified': barcodeVerified,
          if (notes != null) 'notes': notes,
          if (performedAt != null)
            'performedAt': performedAt.toUtc().toIso8601String(),
        }),
      ),
    );
    return data as Map<String, dynamic>;
  }

  /// Ortak istek + hata donusum mantigi. Ag hatalarini, zaman asimini ve
  /// HTTP durum kodlarini kullanicinin anlayacagi mesajlara cevirir.
  ///
  /// `allowRefresh` true iken (varsayilan, tum yetkili uc noktalar icin
  /// gecerli) bir 401 aninda sessizce /auth/refresh denenir ve basarili
  /// olursa `request` YENI token ile bir kez daha calistirilir - `request`
  /// closure'lari her cagrildiginda [_headers] uzerinden depodan taze token
  /// okudugu icin bu, cagiran tarafta hicbir ek kod gerektirmez. Yalnizca bu
  /// sessiz yenileme de basarisiz olursa (refresh token da gecersiz/suresi
  /// dolmus) cagirana gercek bir oturum-sonu hatasi firlatilir. `/auth/login`
  /// gibi zaten bir oturum acmaya calisan istekler `allowRefresh: false`
  /// gecer, cunku onlarin 401'i "yanlis sifre" demektir - yenileme mantigina
  /// hic girmemesi gerekir (bkz. [login]).
  Future<dynamic> _send(
    Future<http.Response> Function() request, {
    String? unauthorizedMessage,
    bool allowRefresh = true,
  }) async {
    http.Response res;
    try {
      res = await request().timeout(_requestTimeout);
    } on TimeoutException {
      throw ApiException(
          'Sunucuya ulaşılamadı: bağlantı zaman aşımına uğradı.');
    } on SocketException {
      throw ApiException(
          'Sunucuya bağlanılamadı. İnternet bağlantınızı ve sunucu adresini kontrol edin.');
    } on http.ClientException {
      throw ApiException(
          'Sunucuya bağlanılamadı. İnternet bağlantınızı ve sunucu adresini kontrol edin.');
    }

    if (res.statusCode == 200 || res.statusCode == 201) {
      if (res.body.isEmpty) return null;
      return jsonDecode(utf8.decode(res.bodyBytes));
    }

    if (res.statusCode == 401 && allowRefresh) {
      final refreshed = await _tryRefreshToken();
      if (refreshed) {
        return _send(request,
            unauthorizedMessage: unauthorizedMessage, allowRefresh: false);
      }
    }

    if (res.statusCode == 401) {
      throw ApiException(
          unauthorizedMessage ?? 'Oturum süresi doldu, tekrar giriş yapın.',
          statusCode: 401);
    }

    if (res.statusCode == 403) {
      // Nest'in RolesGuard'i yetkisiz her istegi ayni jenerik "Forbidden
      // resource" govdesiyle reddeder; bu, kullaniciya gosterilecek bir
      // metin degildir - burada 401 ile ayni sekilde oturum sonu olarak
      // ele alinmasi icin sabit, anlasilir bir mesaja donusturulur. Refresh
      // burada denenmez: bir rol kisitlamasi, gecerli bir token'i
      // yenilemekle duzelmez.
      throw ApiException(
          'Bu işlem için yetkiniz yok veya oturumunuz sona ermiş.',
          statusCode: 403);
    }

    throw ApiException(_extractMessage(res), statusCode: res.statusCode);
  }

  /// Depodaki refresh token ile yeni bir access+refresh token cifti alip
  /// depoya yazar. Basarisizlik (token yok, gecersiz, suresi dolmus veya
  /// baglanti hatasi) sessizce `false` olarak raporlanir - cagiran taraf
  /// ([_send]) bu durumda kullaniciyi normal 401 akisina (oturum sonu)
  /// dusurur. Ayni anda birden fazla cagriyi [_refreshInFlight] araciligiyla
  /// tek bir istekte birlestirir (bkz. alan yorumu).
  Future<bool> _tryRefreshToken() {
    return _refreshInFlight ??=
        _performRefresh().whenComplete(() => _refreshInFlight = null);
  }

  /// [_tryRefreshToken]in tek-ucus sarmalayicisinin arkasindaki fiili
  /// /auth/refresh cagrisi. Ayri bir metot olarak tutulur ki
  /// [_refreshInFlight] alani yalnizca bu Future'i, sarmalayicinin kendisini
  /// degil, onbelleklesin - boylece dedup mantigi ile HTTP cagrisi birbirinden
  /// net bicimde ayrilir.
  Future<bool> _performRefresh() async {
    final refreshToken = await _storage.read(key: 'refreshToken');
    if (refreshToken == null) return false;
    try {
      final res = await http
          .post(
            Uri.parse('$baseUrl/auth/refresh'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'refreshToken': refreshToken}),
          )
          .timeout(_requestTimeout);
      if (res.statusCode != 200 && res.statusCode != 201) return false;
      final map =
          jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
      await _storage.write(
          key: 'accessToken', value: map['accessToken'] as String);
      await _storage.write(
          key: 'refreshToken', value: map['refreshToken'] as String);
      return true;
    } catch (_) {
      return false;
    }
  }

  String _extractMessage(http.Response res) {
    try {
      final body = jsonDecode(utf8.decode(res.bodyBytes));
      final message = body is Map<String, dynamic> ? body['message'] : null;
      if (message is String) return message;
      if (message is List) return message.join(', ');
    } catch (_) {
      // Govde JSON degilse alttaki genel mesaj kullanilir.
    }
    return 'İşlem başarısız oldu (${res.statusCode})';
  }
}
