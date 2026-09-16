import 'dart:convert';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import 'api_service.dart';

/// Internet olmadigi durumlarda hemsirenin girdigi "uygulandi / uygulanmadi"
/// geri bildirimlerini yerelde tutar, baglanti gelince sunucuya gonderir.
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

  Future<void> enqueue(Map<String, dynamic> payload) async {
    final db = await _database;
    await db.insert('pending_logs', {
      'payload': jsonEncode(payload),
      'created_at': DateTime.now().toIso8601String(),
    });
  }

  Future<void> trySyncPending() async {
    final connectivity = await Connectivity().checkConnectivity();
    if (connectivity.contains(ConnectivityResult.none)) return;

    final db = await _database;
    final rows = await db.query('pending_logs', orderBy: 'id ASC');

    for (final row in rows) {
      final payload = jsonDecode(row['payload'] as String) as Map<String, dynamic>;
      try {
        await _api.submitLog(
          scheduleId: payload['scheduleId'] as String,
          action: payload['action'] as String,
          reason: payload['reason'] as String?,
          barcodeVerified: payload['barcodeVerified'] as bool,
          notes: payload['notes'] as String?,
        );
        await db.delete('pending_logs', where: 'id = ?', whereArgs: [row['id']]);
      } catch (_) {
        // Sunucu hala erisilemiyor olabilir; bir sonraki denemede tekrar denenecek.
        break;
      }
    }
  }
}
