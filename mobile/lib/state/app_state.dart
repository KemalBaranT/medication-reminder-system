import 'dart:async';

import 'package:flutter/widgets.dart';
import '../models/app_user.dart';
import '../models/medication_schedule.dart';
import '../models/patient.dart';
import '../models/prescription_summary.dart';
import '../services/api_service.dart';
import '../services/offline_queue_service.dart';

/// Bir doz kararının kaydedilme sonucunun türü. Ekranlar kullanıcıya
/// gösterecekleri mesajı ve sonraki gezinmeyi buna göre seçer.
enum DoseRecordOutcome {
  /// Sunucu kaydı oluşturdu; denetim kaydı merkezi veritabanında.
  synced,

  /// Sunucuya ulaşılamadı; kayıt cihazdaki çevrimdışı kuyrukta ve bağlantı
  /// gelince otomatik gönderilecek. Liste dozu yine de "Verildi" gösterir.
  queuedOffline,

  /// Doz, bu cihazdan bağımsız olarak (başka bir hemşire, önceki bir
  /// gönderim) zaten kapatılmış; bu karar kaydedilmedi.
  alreadyRecorded,

  /// Sunucu isteği reddetti (doğrulama hatası, oturum sonu vb.); kayıt
  /// yapılmadı ve kuyruğa da alınmadı.
  failed,
}

/// [AppState.submitFeedback]'in sonucu: tür ve (hata durumlarında)
/// kullanıcıya gösterilecek mesaj.
class DoseRecordResult {
  const DoseRecordResult(this.outcome,
      [this.message, this.performedAt, this.performedByName]);

  final DoseRecordOutcome outcome;
  final String? message;

  /// Kararın kayda geçtiği an. Senkron kayıtta sunucunun damgaladığı
  /// zamandır (esnek uygulama akışında planlanan saatten farklı olabilir);
  /// çevrimdışı kuyrukta cihaz saatidir. Kayıt yapılmadıysa boştur.
  final DateTime? performedAt;

  /// Kaydı yapan personelin adı; ekranlar denetim bilgisini ("14:18 ·
  /// Ayşe Y.") listeyi yeniden çekmeden gösterebilsin diye taşınır.
  final String? performedByName;

  /// Kararın kalıcı hale geldiği (sunucuda veya güvenli kuyrukta) durumlar.
  bool get isPersisted =>
      outcome == DoseRecordOutcome.synced ||
      outcome == DoseRecordOutcome.queuedOffline;
}

/// Uygulama genelindeki tek kaynak: oturum, hastane ayarı, hemşirenin
/// günlük ilaç listesi ve hasta listesi burada tutulur. UI katmanı
/// (ekranlar) her zaman bu state'i okur/tetikler, doğrudan [ApiService]
/// çağırmaz; böylece hata yönetimi ve yükleniyor durumları tek yerde kalır.
class AppState extends ChangeNotifier with WidgetsBindingObserver {
  final ApiService api;
  final OfflineQueueService offlineQueue;

  AppState({required this.api, required this.offlineQueue}) {
    WidgetsBinding.instance.addObserver(this);
  }

  AppUser? currentUser;
  bool get isLoggedIn => currentUser != null;

  List<MedicationSchedule> schedules = [];
  bool isLoadingSchedule = false;
  String? scheduleError;

  List<Patient> patients = [];
  bool isLoadingPatients = false;
  String? patientsError;

  String? _sessionExpiredMessage;

  /// LoginScreen tarafından tek seferlik okunur ve okunur okunmaz sıfırlanır;
  /// böylece bu Toast yalnızca gerçek bir oturum-sonu yönlendirmesinden
  /// sonra bir kez görünür, ekran her yeniden çizildiğinde tekrar çıkmaz ve
  /// kullanıcının kendi isteğiyle yaptığı normal çıkışta da görünmez (bkz.
  /// [HomeScreen]'deki doğrudan [logout] çağrısı, ki bu alanı hiç
  /// dokunmadan geçer).
  String? consumeSessionExpiredMessage() {
    final message = _sessionExpiredMessage;
    _sessionExpiredMessage = null;
    return message;
  }

  static const _defaultHospitalName = 'İlaç Takip Sistemi';
  String hospitalName = _defaultHospitalName;

  /// Hastane adını backend'deki global ayardan okur (kimlik doğrulama gerekmez).
  /// Sunucuya ulaşılamazsa sessizce varsayılan isimle devam eder; bu, giriş
  /// ekranının backend çevrimdışı olduğunda bile açılmasını engellemez.
  Future<void> loadHospitalName() async {
    try {
      hospitalName = await api.fetchHospitalName();
      notifyListeners();
    } catch (_) {
      // Varsayılan isimle devam edilir.
    }
  }

  /// Uygulama açılırken daha önce kaydedilmiş bir oturum var mı diye bakar.
  /// Varsa kullanıcıyı tekrar giriş yapmaya zorlamadan doğrudan ana ekrana alır.
  Future<void> restoreSession() async {
    final hasSession = await api.hasStoredSession();
    if (!hasSession) return;
    final storedUser = await api.getStoredUser();
    if (storedUser == null) return;
    currentUser = AppUser.fromJson(storedUser);
  }

  /// Kimlik doğrular ve dönen kullanıcıyı oturuma yükler. Hata durumunda
  /// [ApiException] çağıran ekrana (LoginScreen) fırlatılır; burada
  /// yutulmaz, çünkü giriş formu hatayı kullanıcıya göstermek zorundadır.
  Future<void> login(String email, String password) async {
    final data = await api.login(email, password);
    currentUser = AppUser.fromJson(data['user'] as Map<String, dynamic>);
    notifyListeners();
  }

  /// Yerel oturumu ve önbelleğe alınmış tüm klinik veriyi temizler. Cihazda
  /// kayıtlı offline kuyruk (henüz gönderilmemiş geri bildirimler) kasıtlı
  /// olarak silinmez, bir sonraki oturumda senkronize edilmeye devam eder.
  Future<void> logout() async {
    await flushStagedAdministrations();
    await api.logout();
    currentUser = null;
    schedules = [];
    patients = [];
    notifyListeners();
  }

  /// Tüm AppState metotlarının ApiService çağrılarını geçtiği merkezi
  /// oturum bekçisi. `ApiException.isSessionExpired` (401/403) yakalandığında
  /// oturumu kapatır ve LoginScreen'in göstereceği Toast mesajını hazırlar,
  /// ardından istisnayı çağırana yeniden fırlatır - böylece her ekranın
  /// kendi 401/403 mantığını tekrar tekrar yazması gerekmez; çağıran taraf
  /// yalnızca kendi hata gösterimini (scheduleError/patientsError gibi) ele
  /// almaya devam eder.
  Future<T> _withSessionGuard<T>(Future<T> Function() request) async {
    try {
      return await request();
    } on ApiException catch (e) {
      if (e.isSessionExpired) {
        await logout();
        _sessionExpiredMessage =
            'Oturum süreniz doldu, lütfen tekrar giriş yapın.';
        notifyListeners();
      }
      rethrow;
    }
  }

  /// Hemşirenin "Bugünün İlaçları" listesini yeniler. Önce bekleyen offline
  /// geri bildirimlerin senkronizasyonunu dener, sonra güncel listeyi çeker;
  /// böylece çevrimdışı girilen bir kayıt sunucuya ulaşmadan liste
  /// yenilenmiş gibi görünmez. "Tekrar Dene" butonu (bkz. ErrorView) bu
  /// metodu olduğu gibi yeniden çağırır; try-catch, çağrının bağlantı
  /// hatasında güvenle tekrarlanabilir kalmasını garanti eder.
  Future<void> refreshSchedule() async {
    isLoadingSchedule = true;
    scheduleError = null;
    notifyListeners();
    try {
      await offlineQueue.trySyncPending();
      final raw = await _withSessionGuard(() => api.fetchMySchedule());
      final queued = await offlineQueue.pendingDecisions();
      schedules = _applyQueuedDecisions(
        raw
            .map((e) => MedicationSchedule.fromJson(e as Map<String, dynamic>))
            .toList(),
        queued,
      );
    } on ApiException catch (e) {
      scheduleError = e.message;
    } catch (_) {
      scheduleError = 'Liste yüklenemedi: beklenmeyen bir hata oluştu.';
    } finally {
      isLoadingSchedule = false;
      notifyListeners();
    }
  }

  /// Bir bileklik QR/barkod kodunu hastayla eşleştirir. Her rol - vizitteki
  /// doktor, denetimdeki başhemşire, dozu verecek hemşire - bunu
  /// [WristbandScanScreen] üzerinden çağırabilir; sonuç kalıcı olarak burada
  /// saklanmaz (diğer alanlar gibi `notifyListeners` ile yayınlanmaz), çünkü
  /// tek seferlik bir sorgu sonucudur - çağıran taraf hasta detay ekranına
  /// geçip listeden hemen ayrılır. Eşleşen hasta yoksa backend'in döndürdüğü
  /// 404, [ApiException] olarak çağırana (ekrana) olduğu gibi yansıtılır;
  /// 401/403 ise [_withSessionGuard] tarafından oturum sonu olarak ele
  /// alınıp çağırana hâlâ fırlatılır ki ekran kendi yükleniyor durumunu
  /// kapatabilsin.
  Future<Patient> lookupPatientByWristband(String code) async {
    final raw =
        await _withSessionGuard(() => api.fetchPatientByWristband(code));
    return Patient.fromJson(raw);
  }

  /// Bir hastanın reçete/ilaç geçmişini çeker. [lookupPatientByWristband]
  /// gibi, sonuç AppState'te saklanmaz - çağıran ekran (PatientDetailScreen)
  /// kendi durumunda tutar.
  ///
  /// Cihazda henüz gönderilmemiş kararlar ("uygulandı" veya "uygulanmadı"),
  /// [refreshSchedule] ile aynı gerekçeyle sunucu verisinin üzerine
  /// yansıtılır: aksi halde çevrimdışı kapatılmış bir doz bu ekranda tekrar
  /// "İlacı Ver" eylemiyle görünür ve ikinci kez işlenmesine yol açabilirdi.
  Future<List<PrescriptionSummary>> loadPrescriptionsForPatient(
      String patientId) async {
    final raw = await _withSessionGuard(
        () => api.fetchPrescriptionsForPatient(patientId));
    final queued = await offlineQueue.pendingDecisions();
    return raw.map((e) {
      final rx = PrescriptionSummary.fromJson(e as Map<String, dynamic>);
      if (queued.isEmpty) return rx;
      var merged = rx;
      for (final dose in rx.doses) {
        final decision = queued[dose.id];
        if (decision == null || !dose.isOpen) continue;
        merged = merged.replaceDose(decision.action == 'administered'
            ? dose.markAdministered(
                at: decision.performedAt,
                byName: currentUser?.fullName,
                syncPending: true)
            : dose.markNotAdministered(syncPending: true));
      }
      return merged;
    }).toList();
  }

  /// "Hastalar" sekmesi için servisteki tüm hasta listesini çeker. Hemşire
  /// için salt-okunurdur; ekleme/düzenleme yalnızca web panelinden yapılır.
  /// "Tekrar Dene" butonu bu metodu yeniden çağırır (bkz. [refreshSchedule]
  /// ile aynı desen).
  Future<void> loadPatients() async {
    isLoadingPatients = true;
    patientsError = null;
    notifyListeners();
    try {
      final raw = await _withSessionGuard(() => api.fetchPatients());
      patients =
          raw.map((e) => Patient.fromJson(e as Map<String, dynamic>)).toList();
    } on ApiException catch (e) {
      patientsError = e.message;
    } catch (_) {
      patientsError = 'Hasta listesi yüklenemedi: beklenmeyen bir hata oluştu.';
    } finally {
      isLoadingPatients = false;
      notifyListeners();
    }
  }

  /// İlaç Verme iş akışının istemci tarafındaki kayıt adımı: hemşirenin bir
  /// doz için verdiği "uygulandı/uygulanmadı" kararını `POST
  /// /administration-logs` ile sunucuya gönderir ve sonucu listeye anında
  /// yansıtır.
  ///
  /// Hata sınıflandırması bilinçli olarak ayrıntılıdır, çünkü bir ilaç
  /// kaydının sessizce kaybolması da, hiç gönderilemeyecek bir kaydın
  /// "başarılı" gösterilmesi de klinik olarak kabul edilemez:
  ///
  /// * **Başarı** - sunucunun döndürdüğü denetim kaydıyla (saat, personel
  ///   adı) doz yeşil "Verildi" olarak işaretlenir; uygulanmadı kararı ise
  ///   dozu listeden kaldırır.
  /// * **Ağ hatası / 5xx** - geçicidir; karar [offlineQueue]'ya yazılır,
  ///   bağlantı gelince otomatik gönderilir. Doz yine "Verildi" gösterilir
  ///   ama "senkron bekliyor" olarak işaretlenir.
  /// * **409** - doz başka bir yoldan zaten kapatılmış; liste sunucudan
  ///   yenilenir ki hemşire gerçek durumu görsün.
  /// * **Diğer 4xx ve oturum sonu** - kalıcıdır; kuyruğa alınmaz (bir
  ///   sonraki denemede de başarısız olmaya mahkûmdur), liste değişmez ve
  ///   hata kullanıcıya gösterilir. Oturum sonunda [_withSessionGuard]
  ///   kullanıcıyı zaten giriş ekranına yönlendirir.
  ///
  /// **Zaman damgası sunucuda atanır:** Çevrimiçi istek gövdesinde uygulama
  /// saati (`performedAt`) gönderilmez; backend kaydı kendi saatiyle
  /// (`new Date()`) damgalar. Cihaz saati yanlış ayarlanmış veya
  /// değiştirilmiş olabilir; tek ve güvenilir saat kaynağı sunucudur. İstemci
  /// saati yalnızca çevrimdışı kuyruktan geç gönderilen kayıtlarda kullanılır
  /// (bkz. [OfflineQueueService.enqueue]), çünkü orada sunucu saati ilacın
  /// verildiği anı değil bağlantının geri geldiği anı gösterirdi.
  Future<DoseRecordResult> submitFeedback({
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
      final log = await _withSessionGuard(() => api.submitLog(
            scheduleId: scheduleId,
            action: action,
            reason: reason,
            barcodeVerified: barcodeVerified,
            notes: notes,
          ));
      final recordedAt =
          DateTime.tryParse(log['performedAt'] as String? ?? '')?.toLocal() ??
              DateTime.now();
      final byName = log['performedByName'] as String? ?? currentUser?.fullName;
      _applyDecisionLocally(scheduleId, action, at: recordedAt, byName: byName);
      return DoseRecordResult(
          DoseRecordOutcome.synced, null, recordedAt, byName);
    } on ApiException catch (e) {
      final code = e.statusCode;
      if (code == null || code >= 500) {
        return _queueOffline(payload, scheduleId, action);
      }
      if (code == 409) {
        await refreshSchedule();
        return DoseRecordResult(DoseRecordOutcome.alreadyRecorded, e.message);
      }
      return DoseRecordResult(DoseRecordOutcome.failed, e.message);
    } catch (_) {
      return _queueOffline(payload, scheduleId, action);
    }
  }

  /// Geçici bir hatada kararı çevrimdışı kuyruğa yazar ve listeye "senkron
  /// bekliyor" olarak yansıtır. Zaman damgası cihaz saatidir; sunucu bunu,
  /// kayıt geç ulaştığında da ilacın gerçekte verildiği an olarak kabul eder
  /// (bkz. CreateLogDto.performedAt).
  Future<DoseRecordResult> _queueOffline(
      Map<String, dynamic> payload, String scheduleId, String action) async {
    await offlineQueue.enqueue(payload);
    final at = DateTime.now();
    final byName = currentUser?.fullName;
    _applyDecisionLocally(scheduleId, action,
        at: at, byName: byName, syncPending: true);
    return DoseRecordResult(DoseRecordOutcome.queuedOffline, null, at, byName);
  }

  /// "Geri Al" süresi boyunca cihazda bekletilen "Verildi" kayıtları, doz
  /// kimliğine göre.
  final _staged = <String, _StagedAdministration>{};

  /// Doz şu anda "Geri Al" süresi içinde mi (kaydı henüz gönderilmedi).
  bool isStaged(String scheduleId) => _staged.containsKey(scheduleId);

  /// Onaylanmış bir "Verildi" kararını, [undoWindow] boyunca geri
  /// alınabilir şekilde bekletir ve süre dolunca sunucuya gönderir.
  ///
  /// **Neden bekletme:** Sunucudaki uygulama kaydı değiştirilemez bir
  /// denetim olayıdır; gönderildikten sonra "silinmesi" klinik kayıt
  /// bütünlüğünü bozar. Bu yüzden "Geri Al", kaydı gönderip sonra silerek
  /// değil, göndermeden önce kısa bir süre bekleterek sağlanır. Kart bu
  /// süre boyunca iyimser olarak yeşil "Verildi" gösterilir; hemşire geri
  /// alırsa önceki haline döner ve sunucuya hiçbir şey gitmez.
  ///
  /// **Zaman damgası:** Kaydın saatini, kayıt gönderildiğinde sunucu atar
  /// (bkz. [submitFeedback]); cihaz saati çevrimiçi isteklerde
  /// kullanılmaz. Sunucudaki uygulama saati bu nedenle onay anından en
  /// fazla [undoWindow] kadar sonradır; bu fark klinik olarak önemsizdir ve
  /// tek güvenilir saat kaynağının sunucu olması karşılığında kabul edilir.
  ///
  /// **Kayıp koruması:** Uygulama arka plana alınırsa veya oturum kapanırsa
  /// bekleyen tüm kayıtlar süre dolmasını beklemeden hemen gönderilir (bkz.
  /// [flushStagedAdministrations]); böylece onaylanmış bir doz, telefon
  /// kilitlendiği için kaybolmaz.
  ///
  /// Dönen Future, kayıt gönderildiğinde sonucu, geri alındığında `null`
  /// ile tamamlanır.
  Future<DoseRecordResult?> stageAdministration({
    required String scheduleId,
    required bool barcodeVerified,
    Duration undoWindow = const Duration(seconds: 5),
  }) {
    final existing = _staged[scheduleId];
    if (existing != null) return existing.completer.future;

    final previous = schedules.where((s) => s.id == scheduleId).firstOrNull;
    final staged = _StagedAdministration(
      scheduleId: scheduleId,
      barcodeVerified: barcodeVerified,
      performedAt: DateTime.now(),
      previous: previous,
    );
    _staged[scheduleId] = staged;
    staged.timer = Timer(undoWindow, () => _commitStaged(scheduleId));
    _applyDecisionLocally(scheduleId, 'administered',
        at: staged.performedAt,
        byName: currentUser?.fullName,
        syncPending: true);
    return staged.completer.future;
  }

  /// Bekletilen kaydı iptal eder: sunucuya hiçbir şey gönderilmez ve doz
  /// listede önceki haline döner. Süre zaten dolduysa etkisizdir.
  void undoStagedAdministration(String scheduleId) {
    final staged = _staged.remove(scheduleId);
    if (staged == null) return;
    staged.timer?.cancel();
    _restore(staged);
    staged.completer.complete(null);
  }

  /// Bekleyen tüm kayıtları süre dolmasını beklemeden gönderir.
  Future<void> flushStagedAdministrations() async {
    await Future.wait([
      for (final id in _staged.keys.toList()) _commitStaged(id),
    ]);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      flushStagedAdministrations();
    }
  }

  Future<void> _commitStaged(String scheduleId) async {
    final staged = _staged.remove(scheduleId);
    if (staged == null) return;
    staged.timer?.cancel();
    final result = await submitFeedback(
      scheduleId: scheduleId,
      action: 'administered',
      barcodeVerified: staged.barcodeVerified,
    );
    if (result.outcome == DoseRecordOutcome.failed) _restore(staged);
    staged.completer.complete(result);
  }

  void _restore(_StagedAdministration staged) {
    final previous = staged.previous;
    if (previous == null) return;
    schedules = [
      for (final s in schedules) s.id == staged.scheduleId ? previous : s,
    ];
    notifyListeners();
  }

  /// Kaydedilmiş bir kararı listeye yansıtır: "uygulandı" dozu yerinde
  /// yeşil "Verildi" kartına dönüştürür, "uygulanmadı" dozu listeden
  /// kaldırır (iş listesi yalnızca açık ve verilmiş dozları gösterir).
  void _applyDecisionLocally(
    String scheduleId,
    String action, {
    required DateTime at,
    String? byName,
    bool syncPending = false,
  }) {
    if (action == 'administered') {
      schedules = [
        for (final s in schedules)
          s.id == scheduleId
              ? s.markAdministered(
                  at: at, byName: byName, syncPending: syncPending)
              : s,
      ];
    } else {
      schedules = schedules.where((s) => s.id != scheduleId).toList();
    }
    notifyListeners();
  }

  /// Sunucu listesini, cihazda henüz gönderilmemiş kararlarla birleştirir.
  /// Bu olmadan çevrimdışı "Verildi" denmiş bir doz, bir sonraki yenilemede
  /// sunucunun gördüğü haliyle tekrar "Bekliyor" görünür ve ikinci kez
  /// uygulanmasına yol açabilirdi.
  List<MedicationSchedule> _applyQueuedDecisions(
    List<MedicationSchedule> fromServer,
    Map<String, QueuedDecision> queued,
  ) {
    if (queued.isEmpty) return fromServer;
    return [
      for (final s in fromServer)
        if (queued[s.id] case final decision? when s.isOpen) ...[
          if (decision.action == 'administered')
            s.markAdministered(
                at: decision.performedAt,
                byName: currentUser?.fullName,
                syncPending: true),
        ] else
          s,
    ];
  }
}

/// "Geri Al" süresi boyunca bekletilen tek bir "Verildi" kararı.
class _StagedAdministration {
  _StagedAdministration({
    required this.scheduleId,
    required this.barcodeVerified,
    required this.performedAt,
    required this.previous,
  });

  final String scheduleId;
  final bool barcodeVerified;

  /// Hemşirenin kararı onayladığı an. Yalnızca "Geri Al" süresi boyunca
  /// kartta gösterilen iyimser saattir; sunucuya gönderilmez.
  final DateTime performedAt;

  /// Dozun iyimser güncellemeden önceki hali; geri almada veya kalıcı bir
  /// gönderim hatasında listeye geri yüklenir.
  final MedicationSchedule? previous;

  final completer = Completer<DoseRecordResult?>();
  Timer? timer;
}
