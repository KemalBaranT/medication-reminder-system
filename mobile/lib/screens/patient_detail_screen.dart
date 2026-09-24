import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../flows/dose_administration_flow.dart';
import '../models/dose_slot.dart';
import '../models/dose_target.dart';
import '../models/patient.dart';
import '../models/prescription_summary.dart';
import '../state/app_state.dart';
import '../widgets/state_views.dart';
import '../widgets/swipe_action_background.dart';

/// Hasta dosyası: kimlik, mevcut konum, günlük ilaç takvimi ve reçeteler.
/// "Bugünün İlaçları" listesinde bir karta dokunularak veya ana sayfadaki
/// "QR Tara" ile bileklik okutularak ulaşılır; her rol buraya inebilir.
/// Vizitteki bir doktor veya nokta kontrolü yapan bir başhemşire tek
/// bakışta "bu hasta bugün ne aldı, ne bekliyor" sorusunun yanıtını
/// ister. Reçete düzenleme/yazma web panelinin sorumluluğunda kalır (bkz.
/// PatientDetailPage.tsx).
///
/// **Günlük ilaç takvimi:** Sayfanın ana bölümü, hastanın o gün verilecek
/// tüm dozlarını (bütün reçetelerden) saat sırasıyla ve anlık durumlarıyla
/// (Gecikti, Zamanı geldi, Bekliyor, Verildi, Uygulanmadı) gösteren zaman
/// çizelgesidir ([_DailyDoseTimeline]). Doz kaydetme yetkisi olan roller
/// ([AppUser.canAdministerDoses]) için çizelge aynı zamanda eylem
/// yüzeyidir ve "Bugünün İlaçları" kartlarıyla aynı hareketleri kabul eder:
/// saati gelmiş bir dozu soldan sağa kaydırmak "İlaç Onayı" penceresini
/// ([confirmAndAdministerDose]), sağdan sola kaydırmak o doza ait QR
/// doğrulamasını ([scanAndAdministerDose]) açar; doza dokunmak ise
/// "uygulanmadı" bildirimi dahil tüm seçenekleri sunar
/// ([runDoseAdministrationFlow]). Onaylanan doz, "Geri Al" süresi boyunca
/// iyimser olarak yeşil gösterilir ve liste yeniden çekilmeden yerinde
/// güncellenir.
class PatientDetailScreen extends StatefulWidget {
  const PatientDetailScreen({super.key, required this.patient});

  final Patient patient;

  @override
  State<PatientDetailScreen> createState() => _PatientDetailScreenState();
}

class _PatientDetailScreenState extends State<PatientDetailScreen> {
  List<PrescriptionSummary>? _prescriptions;
  bool _loadFailed = false;

  /// Durum etiketleri ve "şimdi" işareti, ekran vardiya boyunca açık kalsa
  /// da güncel kalsın diye periyodik olarak yenilenen referans an.
  DateTime _now = DateTime.now();
  late final Timer _clock;

  @override
  void initState() {
    super.initState();
    _clock = Timer.periodic(const Duration(seconds: 30),
        (_) => setState(() => _now = DateTime.now()));
    _load();
  }

  @override
  void dispose() {
    _clock.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final list = await context
          .read<AppState>()
          .loadPrescriptionsForPatient(widget.patient.id);
      if (!mounted) return;
      setState(() {
        _prescriptions = list;
        _loadFailed = false;
        _now = DateTime.now();
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loadFailed = true);
    }
  }

  DoseTarget _targetOf(PrescriptionSummary rx, DoseSlot dose) =>
      DoseTarget.fromPrescription(widget.patient, rx, dose);

  /// Soldan sağa kaydırma: "İlaç Onayı" penceresi ve "Geri Al" süreli kayıt.
  Future<void> _manualGive(PrescriptionSummary rx, DoseSlot dose) async {
    final result = await confirmAndAdministerDose(context, _targetOf(rx, dose),
        onStaged: (at) => _showOptimistic(rx, dose, at),
        onUndone: () => _replaceDose(rx, dose));
    await _applyResult(rx, dose, result);
  }

  /// Sağdan sola kaydırma: o doza ait QR doğrulaması, ardından aynı onay.
  Future<void> _scanGive(PrescriptionSummary rx, DoseSlot dose) async {
    final result = await scanAndAdministerDose(context, _targetOf(rx, dose),
        onStaged: (at) => _showOptimistic(rx, dose, at),
        onUndone: () => _replaceDose(rx, dose));
    await _applyResult(rx, dose, result);
  }

  /// Doza dokunma: QR, manuel onay veya "uygulanmadı" bildirimi seçenekleri.
  Future<void> _openDoseActions(PrescriptionSummary rx, DoseSlot dose) async {
    final result = await runDoseAdministrationFlow(context, _targetOf(rx, dose),
        onStaged: (at) => _showOptimistic(rx, dose, at),
        onUndone: () => _replaceDose(rx, dose));
    await _applyResult(rx, dose, result);
  }

  /// Onaylanan dozu, kayıt "Geri Al" süresindeyken iyimser olarak yeşil
  /// "Verildi" gösterir; geri alınırsa [_replaceDose] ile önceki haline
  /// döner.
  void _showOptimistic(PrescriptionSummary rx, DoseSlot dose, DateTime at) {
    _replaceDose(
        rx,
        dose.markAdministered(
            at: at,
            byName: context.read<AppState>().currentUser?.fullName,
            syncPending: true));
  }

  void _replaceDose(PrescriptionSummary rx, DoseSlot updated) {
    if (!mounted) return;
    setState(() {
      _prescriptions = [
        for (final p in _prescriptions ?? const <PrescriptionSummary>[])
          p.id == rx.id ? p.replaceDose(updated) : p,
      ];
    });
  }

  /// Bir kararın sonucunu ekrana yansıtır. Kalıcı hale gelen bir karar
  /// (sunucuda veya çevrimdışı kuyrukta) dozu anında yeşil "Verildi"
  /// durumuna geçirir ya da "uygulanmadı" olarak kapatır; 409 durumunda doz
  /// başka bir yoldan zaten kapatıldığı için gerçek durum sunucudan yeniden
  /// okunur. Sonuç mesajını akışın kendisi gösterir.
  Future<void> _applyResult(
      PrescriptionSummary rx, DoseSlot dose, DoseFlowResult? result) async {
    if (result == null || !mounted) return;
    final record = result.record;
    if (record.isPersisted) {
      final pending = record.outcome == DoseRecordOutcome.queuedOffline;
      final updated = result.isAdministered
          ? dose.markAdministered(
              at: record.performedAt ?? DateTime.now(),
              byName: record.performedByName,
              syncPending: pending,
            )
          : dose.markNotAdministered(syncPending: pending);
      _replaceDose(rx, updated);
    } else if (record.outcome == DoseRecordOutcome.alreadyRecorded) {
      await _load();
    }
  }

  Color _patientStatusColor(String status) {
    switch (status) {
      case 'discharged':
        return Colors.grey;
      case 'transferred':
        return Colors.orange;
      default:
        return Colors.green;
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.patient;
    final theme = Theme.of(context);
    final canAdminister = context.select<AppState, bool>(
        (s) => s.currentUser?.canAdministerDoses ?? false);

    return Scaffold(
      appBar: AppBar(title: Text(p.fullName)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            p.fullName,
                            style: const TextStyle(
                                fontSize: 19, fontWeight: FontWeight.bold),
                          ),
                        ),
                        StatusChip(
                            label: p.statusLabel,
                            color: _patientStatusColor(p.status)),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text('Protokol ${p.hospitalPatientNo}',
                        style: TextStyle(color: theme.colorScheme.outline)),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Icon(Icons.location_on_outlined,
                            size: 16, color: theme.colorScheme.primary),
                        const SizedBox(width: 4),
                        Text(p.locationLabel,
                            style:
                                const TextStyle(fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
            ..._buildContent(theme, canAdminister),
          ],
        ),
      ),
    );
  }

  List<Widget> _buildContent(ThemeData theme, bool canAdminister) {
    if (_loadFailed) {
      return [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Text('Reçete listesi yüklenemedi. Yenilemek için aşağı çekin.',
              style: TextStyle(color: theme.colorScheme.error)),
        ),
      ];
    }
    final prescriptions = _prescriptions;
    if (prescriptions == null) {
      return const [
        Padding(
          padding: EdgeInsets.symmetric(vertical: 24),
          child: LoadingView(),
        ),
      ];
    }
    if (prescriptions.isEmpty) {
      return const [
        Padding(
          padding: EdgeInsets.symmetric(vertical: 24),
          child: EmptyView(
              icon: Icons.medication_outlined, message: 'Kayıtlı reçete yok.'),
        ),
      ];
    }
    return [
      _DailyDoseTimeline(
        entries: _todayEntries(prescriptions),
        now: _now,
        canAdminister: canAdminister,
        onManualGive: _manualGive,
        onScanGive: _scanGive,
        onOpenActions: _openDoseActions,
      ),
      const SizedBox(height: 24),
      Text('Reçeteler',
          style: theme.textTheme.titleMedium
              ?.copyWith(fontWeight: FontWeight.bold)),
      const SizedBox(height: 8),
      for (final rx in prescriptions)
        _PrescriptionCard(key: ValueKey(rx.id), prescription: rx, now: _now),
    ];
  }

  /// Günlük takvime girecek dozlar: bugün planlanmış dozlar ile önceki
  /// günden (son 24 saat) kalıp hâlâ açık olan dozlar. İkincisi, gece
  /// yarısından hemen önce planlanıp verilmemiş bir dozun gün değişince
  /// görünmez olmasını önler. İptal edilmiş reçetelerin dozları yalnızca
  /// bugün verilmişlerse (geçmiş kaydı olarak) gösterilir; aksi halde iptal
  /// nedeniyle kapatılan dozlar yanıltıcı biçimde "Uygulanmadı" görünürdü.
  List<(PrescriptionSummary, DoseSlot)> _todayEntries(
      List<PrescriptionSummary> prescriptions) {
    final startOfToday = DateTime(_now.year, _now.month, _now.day);
    final startOfTomorrow = startOfToday.add(const Duration(days: 1));
    final carryOverFrom = _now.subtract(const Duration(hours: 24));
    final entries = <(PrescriptionSummary, DoseSlot)>[
      for (final rx in prescriptions)
        for (final d in rx.doses)
          if ((rx.isActive || d.isAdministered) &&
              ((!d.scheduledTime.isBefore(startOfToday) &&
                      d.scheduledTime.isBefore(startOfTomorrow)) ||
                  (d.isOpen &&
                      d.scheduledTime.isBefore(startOfToday) &&
                      d.scheduledTime.isAfter(carryOverFrom))))
            (rx, d),
    ];
    entries.sort((a, b) => a.$2.scheduledTime.compareTo(b.$2.scheduledTime));
    return entries;
  }
}

/// Hastanın günlük ilaç takvimi: tüm reçetelerden o güne ait dozlar, saat
/// sırasıyla dikey bir zaman çizelgesinde. Geçmiş ile gelecek arasına
/// "Şimdi" işareti konur; böylece hangi dozların geride kaldığı ve
/// sıradakinin ne olduğu tek bakışta okunur. Üstteki özet çipleri günün
/// durumunu (kaç doz verildi, kaç doz gecikti) sayar.
class _DailyDoseTimeline extends StatelessWidget {
  const _DailyDoseTimeline({
    required this.entries,
    required this.now,
    required this.canAdminister,
    required this.onManualGive,
    required this.onScanGive,
    required this.onOpenActions,
  });

  final List<(PrescriptionSummary, DoseSlot)> entries;
  final DateTime now;
  final bool canAdminister;
  final void Function(PrescriptionSummary rx, DoseSlot dose) onManualGive;
  final void Function(PrescriptionSummary rx, DoseSlot dose) onScanGive;
  final void Function(PrescriptionSummary rx, DoseSlot dose) onOpenActions;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final given = entries.where((e) => e.$2.isAdministered).length;
    final overdue = entries.where((e) => e.$2.isOverdue(now)).length;
    final waiting = entries.where((e) => e.$2.isOpen).length - overdue;
    final nowIndex = entries.indexWhere((e) => e.$2.scheduledTime.isAfter(now));

    final rows = <Widget>[];
    for (var i = 0; i < entries.length; i++) {
      if (i == nowIndex) rows.add(_NowMarker(now: now));
      final (rx, dose) = entries[i];
      rows.add(_TimelineRow(
        prescription: rx,
        dose: dose,
        now: now,
        isLast: i == entries.length - 1,
        canAdminister: canAdminister,
        onManualGive: () => onManualGive(rx, dose),
        onScanGive: () => onScanGive(rx, dose),
        onOpenActions: () => onOpenActions(rx, dose),
      ));
    }
    if (entries.isNotEmpty && nowIndex == -1) rows.add(_NowMarker(now: now));

    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(Icons.event_note_rounded,
                    color: theme.colorScheme.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text('Bugünün İlaç Takvimi',
                      style: theme.textTheme.titleMedium
                          ?.copyWith(fontWeight: FontWeight.bold)),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                StatusChip(
                    label: '$given Verildi', color: Colors.green.shade700),
                if (overdue > 0)
                  StatusChip(
                      label: '$overdue Gecikti', color: Colors.red.shade700),
                StatusChip(
                    label: '$waiting Bekliyor',
                    color: Colors.blueGrey.shade600),
              ],
            ),
            if (canAdminister && entries.any((e) => e.$2.isOpen)) ...[
              const SizedBox(height: 8),
              Text(
                  'Sağa kaydır: Verildi · Sola kaydır: QR · Dokun: diğer seçenekler',
                  style: TextStyle(
                      fontSize: 12, color: theme.colorScheme.outline)),
            ],
            const SizedBox(height: 12),
            if (entries.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text('Bugün için planlanmış doz yok.',
                    style: TextStyle(color: theme.colorScheme.outline)),
              )
            else
              ...rows,
          ],
        ),
      ),
    );
  }
}

/// Zaman çizelgesinde geçmiş ile gelecek dozları ayıran "Şimdi" çizgisi.
class _NowMarker extends StatelessWidget {
  const _NowMarker({required this.now});

  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.primary;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(
            width: 52,
            child: Text(DateFormat('HH:mm').format(now),
                style: TextStyle(
                    color: color, fontSize: 12, fontWeight: FontWeight.w800)),
          ),
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          Expanded(child: Container(height: 2, color: color)),
          const SizedBox(width: 6),
          Text('Şimdi',
              style: TextStyle(
                  color: color, fontSize: 12, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

/// Takvimdeki tek bir doz satırı: planlanan saat, zaman çizgisi noktası,
/// ilaç/doz ve anlık durum etiketi.
///
/// Saati gelmiş veya gecikmiş bir doz, yetkili rol için üç hareket kabul
/// eder: **soldan sağa kaydırma** "İlaç Onayı" penceresini, **sağdan sola
/// kaydırma** o doza ait QR doğrulamasını açar; **dokunma** "uygulanmadı"
/// bildirimi dahil tüm seçenekleri sunar. Saati henüz gelmemiş dozlarda
/// hareketler kapalıdır; hızlı bir hareketin akşam dozunu sabahtan
/// kapatmasını önler. Kaydırma satırı listeden kaldırmaz, onaylanan satır
/// yerinde yeşile döner.
class _TimelineRow extends StatelessWidget {
  const _TimelineRow({
    required this.prescription,
    required this.dose,
    required this.now,
    required this.isLast,
    required this.canAdminister,
    required this.onManualGive,
    required this.onScanGive,
    required this.onOpenActions,
  });

  final PrescriptionSummary prescription;
  final DoseSlot dose;
  final DateTime now;
  final bool isLast;
  final bool canAdminister;
  final VoidCallback onManualGive;
  final VoidCallback onScanGive;
  final VoidCallback onOpenActions;

  /// Satırın renk tonu, durum etiketi ve alt satır açıklaması.
  (Color, String, String?) _status() {
    final hm = DateFormat('HH:mm');
    if (dose.isAdministered) {
      final timing = dose.administeredTiming;
      final at = dose.administeredAt;
      return (
        Colors.green.shade700,
        at != null ? 'Verildi ${hm.format(at)}' : 'Verildi',
        [
          if (dose.administeredByName != null) dose.administeredByName!,
          if (timing != null) timing.label,
          if (dose.syncPending) 'gönderim bekliyor',
        ].join(' · '),
      );
    }
    if (!dose.isOpen) {
      return (Colors.grey.shade600, 'Uygulanmadı', null);
    }
    final timing = DoseTiming.between(dose.scheduledTime, now);
    if (dose.isOverdue(now)) {
      return (Colors.red.shade700, 'Gecikti · ${timing.durationLabel}', null);
    }
    if (timing.kind == DoseTimingKind.early && !dose.isActionable(now)) {
      return (
        Colors.blueGrey.shade600,
        'Bekliyor',
        '${timing.durationLabel} sonra'
      );
    }
    return (Colors.orange.shade800, 'Zamanı geldi', null);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (color, label, detail) = _status();
    final actionable = canAdminister && dose.isActionable(now);
    final rx = prescription;

    final row = InkWell(
      onTap: actionable ? onOpenActions : null,
      borderRadius: BorderRadius.circular(12),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              width: 52,
              child: Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(DateFormat('HH:mm').format(dose.scheduledTime),
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 14)),
              ),
            ),
            SizedBox(
              width: 10,
              child: Column(
                children: [
                  const SizedBox(height: 15),
                  Container(
                    width: 10,
                    height: 10,
                    decoration:
                        BoxDecoration(color: color, shape: BoxShape.circle),
                  ),
                  if (!isLast)
                    Expanded(
                      child: Container(
                          width: 2, color: theme.colorScheme.outlineVariant),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text('${rx.medicationName} · ${rx.dosage}',
                              style: const TextStyle(
                                  fontWeight: FontWeight.w700, fontSize: 14.5)),
                        ),
                        const SizedBox(width: 6),
                        StatusChip(label: label, color: color),
                      ],
                    ),
                    if (detail != null && detail.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(detail,
                          style: TextStyle(
                              color: theme.colorScheme.outline, fontSize: 12)),
                    ],
                    if (rx.route != null && rx.route!.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(rx.route!,
                          style: TextStyle(
                              color: theme.colorScheme.outline, fontSize: 12)),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );

    if (!actionable) return row;

    return Dismissible(
      key: ValueKey('swipe-${dose.id}'),
      direction: DismissDirection.horizontal,
      dismissThresholds: const {
        DismissDirection.startToEnd: 0.4,
        DismissDirection.endToStart: 0.4,
      },
      confirmDismiss: (direction) async {
        if (direction == DismissDirection.startToEnd) {
          onManualGive();
        } else {
          onScanGive();
        }
        return false;
      },
      background: const SwipeActionBackground(
        alignment: Alignment.centerLeft,
        color: Color(0xFF2E7D32),
        icon: Icons.check_circle_rounded,
        label: 'Verildi',
        margin: EdgeInsets.zero,
        radius: 12,
      ),
      secondaryBackground: const SwipeActionBackground(
        alignment: Alignment.centerRight,
        color: Color(0xFF37474F),
        icon: Icons.qr_code_scanner_rounded,
        label: 'QR ile Onayla',
        margin: EdgeInsets.zero,
        radius: 12,
      ),
      child: row,
    );
  }
}

/// Tek bir reçetenin bilgi kartı: ilaç, doz, sıklık, reçete durumu ve son
/// uygulama bilgisi. Kart kasıtlı olarak eylem içermez; doz bazındaki tüm
/// eylemler günlük ilaç takvimindedir ([_DailyDoseTimeline]). Aynı dozu
/// kaydeden iki ayrı yüzey, hangisinin neyi kaydettiği konusunda tereddüt
/// yaratırdı.
class _PrescriptionCard extends StatelessWidget {
  const _PrescriptionCard({
    super.key,
    required this.prescription,
    required this.now,
  });

  final PrescriptionSummary prescription;
  final DateTime now;

  Color get _statusColor => switch (prescription.status) {
        'cancelled' => Colors.red,
        'completed' => Colors.grey,
        _ => Colors.green,
      };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final rx = prescription;
    final last = rx.lastAdministeredDose;
    final next =
        rx.isActive ? rx.doses.where((d) => d.isOpen).firstOrNull : null;

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${rx.medicationName} - ${rx.dosage}',
                          style: const TextStyle(
                              fontSize: 16, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 2),
                      Text(
                          '${rx.frequencyHours} saatte bir'
                          '${rx.route != null ? ' - ${rx.route}' : ''}',
                          style: TextStyle(color: theme.colorScheme.outline)),
                      if (next != null) ...[
                        const SizedBox(height: 2),
                        Text(
                            'Sıradaki doz: '
                            '${DateFormat('dd.MM HH:mm').format(next.scheduledTime)}',
                            style: TextStyle(
                                color: next.isOverdue(now)
                                    ? Colors.red.shade700
                                    : theme.colorScheme.outline,
                                fontSize: 12.5,
                                fontWeight: FontWeight.w600)),
                      ],
                    ],
                  ),
                ),
                StatusChip(label: rx.statusLabel, color: _statusColor),
              ],
            ),
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 350),
              switchInCurve: Curves.easeOutBack,
              transitionBuilder: (child, animation) => SizeTransition(
                sizeFactor: animation,
                child: FadeTransition(opacity: animation, child: child),
              ),
              child: last == null
                  ? const SizedBox.shrink()
                  : Padding(
                      key: ValueKey('${last.id}-${last.syncPending}'),
                      padding: const EdgeInsets.only(top: 12),
                      child: _AdministeredBanner(dose: last),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Son uygulanan dozun yeşil "Verildi" etiketi: gerçek uygulama saati,
/// personel ve planlanan saate göre sapma. Kayıt henüz çevrimdışı
/// kuyruktaysa bunu açıkça belirtir; hemşireden gizlemek, aynı dozun
/// başka bir cihazdan tekrar verilmesine zemin hazırlardı.
class _AdministeredBanner extends StatelessWidget {
  const _AdministeredBanner({required this.dose});

  final DoseSlot dose;

  @override
  Widget build(BuildContext context) {
    final at = dose.administeredAt;
    final timing = dose.administeredTiming;
    final detail = [
      if (at != null) DateFormat('HH:mm').format(at),
      if (dose.administeredByName != null) dose.administeredByName!,
      if (timing != null) timing.label,
    ].join(' · ');

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.green.shade600,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const Icon(Icons.check_circle_rounded, color: Colors.white, size: 20),
          const SizedBox(width: 8),
          const Text('Son doz verildi',
              style:
                  TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(detail,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.92),
                    fontSize: 12.5)),
          ),
          if (dose.syncPending)
            const Tooltip(
              message: 'Cihazda kayıtlı, bağlantı gelince gönderilecek',
              child: Icon(Icons.cloud_upload_outlined,
                  color: Colors.white, size: 18),
            ),
        ],
      ),
    );
  }
}
