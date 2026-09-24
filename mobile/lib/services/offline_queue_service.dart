import 'dart:convert';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import 'api_service.dart';

/// Kuyrukta bekleyen tek bir kararın özeti.
typedef QueuedDecision = ({String action, DateTime performedAt});

/// İnternet olmadığı durumlarda hemşirenin girdiği "uygulandı / uygulanmadı"
/// geri bildirimlerini yerelde tutar, bağlantı gelince sunucuya gönderir.
class OfflineQueueService {
  final ApiService _api;
  Database? _db;

  OfflineQueueService(this._api);

  Future<Database> get _database async {
    if (_db != null) return _db!;
    final path = join(await getDatabasesPath(), 'ilac_takip_offline.db');
    _db = await openDatabase(
      path,
      version: 1,
      onCreate: (db, version) => db.execute('''
        CREATE TABLE pending_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      '''),
    );
    return _db!;
  }

  /// Kararı kuyruğa yazar. Kararın verildiği an (kuyruğa yazılma anı)
  /// payload'a eklenir; kayıt sunucuya saatler sonra ulaşsa bile denetim
  /// kaydı gerçek uygulama zamanını taşır. Bu, istemci saatinin sunucuya
  /// gönderildiği tek durumdur; backend değeri yalnızca son 24 saat içinde
  /// ve gelecekte değilse kabul eder (bkz. CreateLogDto.performedAt).
  Future<void> enqueue(Map<String, dynamic> payload) async {
    final db = await _database;
    await db.insert('pending_logs', {
      'payload': jsonEncode({
        ...payload,
        'performedAt': DateTime.now().toUtc().toIso8601String(),
      }),
      'created_at': DateTime.now().toIso8601String(),
    });
  }

  /// Kuyrukta bekleyen kararlar, doz kimliğine göre. [AppState], sunucudan
  /// gelen listeyi bu haritayla birleştirir; böylece çevrimdışı "Verildi"
  /// denmiş bir doz, kayıt henüz sunucuya ulaşmamış olsa bile listede tekrar
  /// "Bekliyor" olarak görünüp ikinci kez uygulanma riskine yol açmaz.
  Future<Map<String, QueuedDecision>> pendingDecisions() async {
    final db = await _database;
    final rows = await db.query('pending_logs', orderBy: 'id ASC');
    final result = <String, QueuedDecision>{};
    for (final row in rows) {
      final payload =
          jsonDecode(row['payload'] as String) as Map<String, dynamic>;
      result[payload['scheduleId'] as String] = (
        action: payload['action'] as String,
        performedAt: _performedAtOf(payload, row),
      );
    }
    return result;
  }

  /// Kararın cihazda verildiği an. Bu alan eklenmeden önce kuyruğa yazılmış
  /// kayıtlarda payload'da bulunmaz; o durumda satırın kuyruğa eklenme
  /// zamanı aynı anı temsil eder (karar verildiği anda yazılır).
  static DateTime _performedAtOf(
      Map<String, dynamic> payload, Map<String, Object?> row) {
    final raw =
        payload['performedAt'] as String? ?? row['created_at'] as String;
    return DateTime.parse(raw).toLocal();
  }

  /// Bekleyen kayıtları sırayla sunucuya gönderir.
  ///
  /// Ağ hatası veya 5xx geçicidir: kuyruk durur ve bir sonraki denemede
  /// kaldığı yerden devam eder (sıra korunur). Buna karşın 4xx yanıtları
  /// (örneğin 409 - doz başka bir hemşire tarafından zaten kaydedilmiş,
  /// 404 - doz silinmiş) kalıcıdır; aynı istek hiçbir zaman başarılı
  /// olamayacağından kayıt kuyruktan düşürülür. Aksi halde tek bir
  /// "zehirli" kayıt, arkasındaki tüm geçerli kayıtların gönderilmesini
  /// süresiz olarak engellerdi. Oturum hataları (401/403) ise kalıcı
  /// sayılmaz: kullanıcı yeniden giriş yaptığında kayıt gönderilmelidir.
  Future<void> trySyncPending() async {
    final connectivity = await Connectivity().checkConnectivity();
    if (connectivity.contains(ConnectivityResult.none)) return;

    final db = await _database;
    final rows = await db.query('pending_logs', orderBy: 'id ASC');

    for (final row in rows) {
      final payload =
          jsonDecode(row['payload'] as String) as Map<String, dynamic>;
      try {
        await _api.submitLog(
          scheduleId: payload['scheduleId'] as String,
          action: payload['action'] as String,
          reason: payload['reason'] as String?,
          barcodeVerified: payload['barcodeVerified'] as bool,
          notes: payload['notes'] as String?,
          performedAt: _performedAtOf(payload, row),
        );
      } on ApiException catch (e) {
        final code = e.statusCode;
        final permanent =
            code != null && code >= 400 && code < 500 && !e.isSessionExpired;
        if (!permanent) break;
      } catch (_) {
        break;
      }
      await db.delete('pending_logs', where: 'id = ?', whereArgs: [row['id']]);
    }
  }
}
