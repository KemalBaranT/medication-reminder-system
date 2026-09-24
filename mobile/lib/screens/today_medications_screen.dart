import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../flows/dose_administration_flow.dart';
import '../models/dose_target.dart';
import '../models/medication_schedule.dart';
import '../models/worklist.dart';
import '../state/app_state.dart';
import '../widgets/smart_search_bar.dart';
import '../widgets/swipe_action_background.dart';
import '../widgets/state_views.dart';
import '../widgets/status_filter_bar.dart';
import 'patient_detail_screen.dart';

/// HomeScreen'in "Bugünün İlaçları" sekmesinde gösterilen gövde widget'ı.
/// Kendi AppBar'ı yoktur; yükleniyor/boş/hata durumlarını yönetir.
///
/// Sunucudan gelen `AppState.schedules` zaten "bugünün açık dozları ve bugün
/// verilmiş dozlar" ile sınırlıdır (bkz. ScheduleController.mine); verilmiş
/// dozlar yeşil "Verildi" etiketi ve denetim izi (saat, personel) ile
/// listenin altında gösterilir. Bu ekrandaki arama ve durum
/// filtresi bu listenin üstüne eklenen, tamamen istemci tarafı bir
/// görüntüleme filtresidir - ikisi de sunucuya ayrı bir istek göndermez,
/// sadece hangi kartların çizileceğini belirler.
class TodayMedicationsView extends StatefulWidget {
  const TodayMedicationsView({super.key});

  @override
  State<TodayMedicationsView> createState() => _TodayMedicationsViewState();
}

class _TodayMedicationsViewState extends State<TodayMedicationsView> {
  final _searchController = TextEditingController();
  String _query = '';
  ScheduleStatusFilter _statusFilter = ScheduleStatusFilter.all;

  /// Aciliyet sıralaması ve "Gecikti" vurgusu zamana bağlıdır; ekran vardiya
  /// boyunca açık kalsa da saati gelen doz kendiliğinden yukarı çıksın diye
  /// liste periyodik olarak yeniden değerlendirilir.
  DateTime _now = DateTime.now();
  late final Timer _clock;

  @override
  void initState() {
    super.initState();
    _clock = Timer.periodic(const Duration(seconds: 30),
        (_) => setState(() => _now = DateTime.now()));
    WidgetsBinding.instance.addPostFrameCallback(
        (_) => context.read<AppState>().refreshSchedule());
  }

  @override
  void dispose() {
    _clock.cancel();
    _searchController.dispose();
    super.dispose();
  }

  bool _matchesStatusFilter(MedicationSchedule s) {
    switch (_statusFilter) {
      case ScheduleStatusFilter.all:
        return true;
      case ScheduleStatusFilter.late_:
        return s.isLate;
      // "Bekliyor": henüz gecikmemiş her açık doz (pending veya süresi
      // gelmemiş notified). Bugün verilmiş dozlar da listede olduğundan
      // `isOpen` koşulu olmadan "Verildi" kartları burada da görünürdü.
      case ScheduleStatusFilter.pending:
        return s.isOpen && !s.isLate;
      case ScheduleStatusFilter.administered:
        return s.status == 'administered';
    }
  }

  /// Dozun hastasını bileklik kodu üzerinden çözümler ve hasta dosyasını
  /// ([PatientDetailScreen]) açar. Her rolün kart dokunuşu buraya çıkar:
  /// dosyada hastanın günlük ilaç takvimi görülür; doz kaydetme yetkisi
  /// olan roller ([AppUser.canAdministerDoses]) QR doğrulaması ve
  /// "uygulanmadı" bildirimini de oradan yapar.
  Future<void> _openPatientDetail(
      BuildContext context, MedicationSchedule s) async {
    final appState = context.read<AppState>();
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(child: CircularProgressIndicator()),
    );
    try {
      final patient =
          await appState.lookupPatientByWristband(s.patientWristbandCode);
      if (!context.mounted) return;
      Navigator.of(context).pop();
      Navigator.of(context).push(
        MaterialPageRoute(
            builder: (_) => PatientDetailScreen(patient: patient)),
      );
    } catch (_) {
      if (!context.mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Hasta bilgisi yüklenemedi.')),
      );
    }
  }

  /// Ana ekranda gösterilecek kartları üretir: önce listeyi reçete başına
  /// tek karta indirir ([buildWorklist]), sonra seçili durum filtresini ve
  /// hasta/ilaç adı aramasını uygular, en son aciliyete göre sıralar.
  ///
  /// **Tekil ve en acil doz:** Aynı ilacın gün içindeki dozları alt alta
  /// ayrı kartlar olarak görünmez; her reçete için yalnızca o anda önem
  /// taşıyan doz gösterilir (gruplama kuralları için bkz. [buildWorklist]).
  /// Günün tam planı, karta dokunulduğunda açılan hasta dosyasındaki
  /// "Bugünün İlaç Takvimi"ndedir.
  ///
  /// **Akıllı kronolojik sıralama:** Kartlar [DoseUrgency] kademelerine göre
  /// dizilir: önce gecikmiş/kaçırılmış dozlar, sonra saati gelmiş dozlar,
  /// sonra saati henüz gelmemiş dozlar, en altta bugün verilmiş dozlar.
  /// Açık dozlar her kademe içinde planlanan saate göre artan sıradadır;
  /// verilmiş dozlarda en son verilen üsttedir. Kademeler zamanla değiştiği
  /// için gruplama ve sıralama her periyodik yenilemede yeniden hesaplanır.
  List<WorklistEntry> _visibleEntries(List<MedicationSchedule> schedules) {
    final query = _query.trim().toLowerCase();
    final entries = buildWorklist(schedules, _now).where((e) {
      final s = e.dose;
      if (!_matchesStatusFilter(s)) return false;
      if (query.isEmpty) return true;
      return s.patientName.toLowerCase().contains(query) ||
          s.medicationName.toLowerCase().contains(query);
    }).toList();
    entries.sort((x, y) {
      final a = x.dose, b = y.dose;
      final tier = a.urgencyAt(_now).index.compareTo(b.urgencyAt(_now).index);
      if (tier != 0) return tier;
      if (a.isAdministered) {
        return (b.administeredAt ?? b.scheduledTime)
            .compareTo(a.administeredAt ?? a.scheduledTime);
      }
      return a.scheduledTime.compareTo(b.scheduledTime);
    });
    return entries;
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final timeFormat = DateFormat('HH:mm');
    final entries = _visibleEntries(appState.schedules);
    // Backend'in POST /administration-logs uç noktası klinik personel
    // arasında hemşirelik personeliyle (hemşire, başhemşire) sınırlıdır;
    // Super Admin ise sistem genelindeki geçersiz kılma gereği bu kısıttan
    // muaftır. Kart dokunuşu her rol için aynıdır (hasta dosyası); bu bayrak
    // yalnızca "sağa kaydır = Verildi" hareketinin etkin olup olmadığını
    // belirler. İş listesini servis geneli denetim için paylaşan doktorlarda
    // kaydırma kapalıdır, çünkü bir uygulama kararı göndermeleri yalnızca
    // 403 ile sonuçlanır.
    final canAdminister = appState.currentUser?.canAdministerDoses ?? false;

    Widget body;
    if (appState.isLoadingSchedule && appState.schedules.isEmpty) {
      body = const LoadingView();
    } else if (appState.scheduleError != null && appState.schedules.isEmpty) {
      body = ErrorView(
        message: appState.scheduleError!,
        onRetry: () => appState.refreshSchedule(),
      );
    } else if (appState.schedules.isEmpty) {
      body = const EmptyView(
        icon: Icons.check_circle_outline,
        message:
            'Şu an için bekleyen ilaç yok.\nYeni doz zamanı geldiğinde burada listelenecek.',
      );
    } else if (entries.isEmpty) {
      // Worklist dolu ama arama/filtre kombinasyonuyla eşleşen yok: bunu
      // "bekleyen ilaç yok" (işlerin bittiği) durumundan ayrı, farklı bir
      // ikon ve mesajla göstermek, hemşirenin filtreyi mi yoksa gerçekten
      // boş bir listeyi mi gördüğünü karıştırmasını engeller.
      body = const EmptyView(
        icon: Icons.search_off_rounded,
        message: 'Sonuç bulunamadı.',
      );
    } else {
      body = ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        itemCount: entries.length,
        itemBuilder: (context, index) {
          final entry = entries[index];
          final s = entry.dose;
          final theme = Theme.of(context);
          final isLate = s.isLate;
          final isDone = s.isAdministered;
          // Marka rengi "Medical Point" revizyonuyla kırmızıya geçtiği
          // için, gecikmemiş bir dozun vurgusu artık `colorScheme.primary`
          // kullanamaz - "Gecikti" ile ayırt edilemez hale gelirdi. Nötr
          // bir grafit tonu, StatusFilterBar'daki "Tümü" çipiyle aynı
          // seçimle tutarlıdır. Verilmiş dozlar yeşille ayrışır.
          final accentColor = isDone
              ? Colors.green.shade600
              : isLate
                  ? Colors.red.shade600
                  : Colors.blueGrey.shade600;

          final cardBody = Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 14, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 52,
                      height: 52,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: accentColor.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            timeFormat.format(s.scheduledTime),
                            style: TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 14,
                                color: accentColor),
                          ),
                          Icon(Icons.medication_rounded,
                              size: 14, color: accentColor),
                        ],
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  s.patientName,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 15.5),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              if (isDone)
                                StatusChip(
                                    label: 'Verildi',
                                    color: Colors.green.shade700)
                              else if (isLate)
                                const StatusChip(
                                    label: 'Gecikti', color: Colors.red),
                            ],
                          ),
                          const SizedBox(height: 3),
                          Row(
                            children: [
                              Icon(Icons.location_on_outlined,
                                  size: 14, color: theme.colorScheme.outline),
                              const SizedBox(width: 3),
                              Expanded(
                                child: Text(
                                  s.locationLabel,
                                  style: TextStyle(
                                      color: theme.colorScheme.outline,
                                      fontSize: 12.5),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(
                            '${s.medicationName} - ${s.dosage}',
                            style: const TextStyle(
                                fontWeight: FontWeight.w600, fontSize: 13.5),
                          ),
                          if (s.prescriberDisplay != null) ...[
                            const SizedBox(height: 2),
                            Text(
                              'Reçete eden: ${s.prescriberDisplay}',
                              style: TextStyle(
                                  color: theme.colorScheme.outline,
                                  fontSize: 11.5),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                          if (isDone) ...[
                            const SizedBox(height: 6),
                            _AdministeredAuditLine(
                                schedule: s, timeFormat: timeFormat),
                          ],
                          if (entry.otherOverdueCount > 0 ||
                              entry.nextDoseAt != null) ...[
                            const SizedBox(height: 6),
                            _HiddenDosesLine(
                                entry: entry, timeFormat: timeFormat),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
                if (!isDone &&
                    s.nurseNote != null &&
                    s.nurseNote!.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Container(
                    width: double.infinity,
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.amber.shade50,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: Colors.amber.shade200),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.warning_amber_rounded,
                            size: 17, color: Colors.amber.shade800),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            s.nurseNote!,
                            style: TextStyle(
                                color: Colors.amber.shade900,
                                fontSize: 12.5,
                                height: 1.3),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          );

          final borderColor = isDone
              ? Colors.green.shade200
              : isLate
                  ? Colors.red.shade200
                  : null;
          final card = Card(
            margin: const EdgeInsets.symmetric(vertical: 6),
            shape: borderColor != null
                ? RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(18),
                    side: BorderSide(color: borderColor),
                  )
                : null,
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              // Dokunma her rol ve her doz için hastanın dosyasını açar:
              // orada o hastanın günlük ilaç takvimi (tüm dozlar, saatleri
              // ve anlık durumları) tek bakışta görülür; "uygulanmadı"
              // bildirimi de oradan, ilgili doza dokunularak yapılır.
              onTap: () => _openPatientDetail(context, s),
              child: cardBody,
            ),
          );

          if (!canAdminister || !s.isActionableAt(_now)) return card;

          // Çift yönlü kaydırma. İki hareket de kartı listeden çıkarmaz
          // (confirmDismiss her zaman false döner, kart yerine oturur);
          // yalnızca ilgili akışı başlatır:
          //  * Soldan sağa -> manuel onay: "İlaç Onayı" penceresi, ardından
          //    "Geri Al" süreli kayıt (bkz. confirmAndAdministerDose).
          //  * Sağdan sola -> o doza ait QR doğrulaması: global tarayıcı
          //    menüsüz açılır, doğrulama sonrası aynı onay penceresi gelir
          //    (bkz. scanAndAdministerDose).
          // Kaydırma yalnızca saati gelmiş veya gecikmiş dozlarda etkindir;
          // eşik, kartın belirgin bir kısmının kaydırılmasını gerektirir.
          final target = DoseTarget.fromSchedule(s);
          return Dismissible(
            key: ValueKey(s.id),
            direction: DismissDirection.horizontal,
            dismissThresholds: const {
              DismissDirection.startToEnd: 0.4,
              DismissDirection.endToStart: 0.4,
            },
            confirmDismiss: (direction) async {
              if (direction == DismissDirection.startToEnd) {
                confirmAndAdministerDose(context, target);
              } else {
                scanAndAdministerDose(context, target);
              }
              return false;
            },
            background: const SwipeActionBackground(
              alignment: Alignment.centerLeft,
              color: Color(0xFF2E7D32),
              icon: Icons.check_circle_rounded,
              label: 'Verildi',
            ),
            secondaryBackground: const SwipeActionBackground(
              alignment: Alignment.centerRight,
              color: Color(0xFF37474F),
              icon: Icons.qr_code_scanner_rounded,
              label: 'QR ile Onayla',
            ),
            child: card,
          );
        },
      );
    }

    return Column(
      children: [
        SmartSearchBar(
          controller: _searchController,
          hintText: 'Hasta veya ilaç ara...',
          onChanged: (value) => setState(() => _query = value),
        ),
        const SizedBox(height: 4),
        StatusFilterBar(
          selected: _statusFilter,
          onChanged: (filter) => setState(() => _statusFilter = filter),
        ),
        const SizedBox(height: 4),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => appState.refreshSchedule(),
            child: body,
          ),
        ),
      ],
    );
  }
}

/// Verilmiş bir dozun kartında gösterilen denetim izi: kim, saat kaçta
/// kaydetti. Vardiya devrinde bir sonraki hemşirenin "bu doz verildi mi,
/// kim verdi" sorusunu hasta dosyasını açmadan yanıtlamasını sağlar. Kayıt
/// henüz çevrimdışı kuyruktaysa bu durum açıkça belirtilir; hemşire
/// kaydın merkezi sistemde görünmediğini bilmelidir.
class _AdministeredAuditLine extends StatelessWidget {
  const _AdministeredAuditLine(
      {required this.schedule, required this.timeFormat});

  final MedicationSchedule schedule;
  final DateFormat timeFormat;

  @override
  Widget build(BuildContext context) {
    final at = schedule.administeredAt;
    final parts = <String>[
      if (at != null) 'Verildi ${timeFormat.format(at)}',
      if (schedule.administeredByName != null) schedule.administeredByName!,
    ];
    final color =
        schedule.syncPending ? Colors.amber.shade800 : Colors.green.shade700;
    return Row(
      children: [
        Icon(
          schedule.syncPending
              ? Icons.cloud_upload_outlined
              : Icons.check_circle_rounded,
          size: 15,
          color: color,
        ),
        const SizedBox(width: 4),
        Expanded(
          child: Text(
            [
              ...parts,
              if (schedule.syncPending) 'gönderim bekliyor',
            ].join(' · '),
            style: TextStyle(
                color: color, fontSize: 12, fontWeight: FontWeight.w600),
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}

/// Gruplamanın ana ekrandan gizlediği dozların özeti: aynı ilacın başka
/// gecikmiş dozları varsa sayısı (kırmızı) ve sonraki dozun saati.
/// Gecikmiş dozların sayısı gizlenmez, çünkü gruplama birikmiş gecikmeleri
/// ana ekrandan fark edilemez hale getirmemelidir.
class _HiddenDosesLine extends StatelessWidget {
  const _HiddenDosesLine({required this.entry, required this.timeFormat});

  final WorklistEntry entry;
  final DateFormat timeFormat;

  @override
  Widget build(BuildContext context) {
    final outline = Theme.of(context).colorScheme.outline;
    final parts = <(String, Color)>[
      if (entry.otherOverdueCount > 0)
        ('+${entry.otherOverdueCount} gecikmiş doz daha', Colors.red.shade700),
      if (entry.nextDoseAt != null)
        (
          'Sonraki doz ${timeFormat.format(entry.nextDoseAt!.toLocal())}',
          outline
        ),
    ];
    return Wrap(
      spacing: 10,
      children: [
        for (final (text, color) in parts)
          Text(text,
              style: TextStyle(
                  color: color, fontSize: 12, fontWeight: FontWeight.w600)),
      ],
    );
  }
}
