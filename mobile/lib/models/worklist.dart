import 'medication_schedule.dart';

/// "Bugünün İlaçları" ana ekranındaki tek bir kart: bir reçetenin (hasta +
/// ilaç) o anda en çok önem taşıyan dozu ve gizlenen dozlar hakkında özet.
class WorklistEntry {
  const WorklistEntry({
    required this.dose,
    this.otherOverdueCount = 0,
    this.nextDoseAt,
  });

  /// Kartta gösterilen ve kaydırma hareketlerinin hedeflediği doz.
  final MedicationSchedule dose;

  /// Aynı reçetenin, kartta gösterilmeyen diğer gecikmiş dozlarının sayısı.
  /// Gruplama bu dozları gizlediği için sayıları kartta açıkça belirtilir;
  /// aksi halde birikmiş gecikmeler ana ekrandan fark edilemezdi.
  final int otherOverdueCount;

  /// Gösterilen dozdan sonraki ilk açık dozun planlanan saati; kartta
  /// "Sonraki doz" bilgisi olarak gösterilir.
  final DateTime? nextDoseAt;
}

/// Sunucudan gelen doz listesini, reçete başına tek kart olacak şekilde
/// gruplar.
///
/// **Neden gruplama:** Aynı ilacın gün içindeki tüm dozları (08:00, 10:00,
/// 12:00 …) ayrı kartlar olarak alt alta dizildiğinde ana ekran dolup taşar
/// ve hangi kartın şu anda verilmesi gerektiği karışır. Ana ekranın tek
/// sorusu "şimdi ne yapmalıyım"dır; günün tam planı, karta dokunulduğunda
/// açılan hasta dosyasındaki "Bugünün İlaç Takvimi"ndedir.
///
/// **Neden hasta değil reçete başına:** Hasta başına tek kart, aynı hastanın
/// aynı saatte gecikmiş ikinci ilacını gizlerdi. Reçete başına tek kart,
/// kalabalığı giderirken her ilacın en acil dozunu görünür tutar.
///
/// **Hangi doz gösterilir** (öncelik sırasıyla):
/// 1. Saati gelmiş veya gecikmiş açık dozlar varsa, planlanan saati şu ana
///    en yakın olanı. Daha eski gecikmiş dozlar [WorklistEntry.otherOverdueCount]
///    ile belirtilir.
/// 2. Yoksa, bugün en son verilmiş doz (yeşil kart). Kayıttan hemen sonra
///    kartın yeşile dönmesi ve sonraki dozun saatini göstermesi bu kuralla
///    sağlanır; sonraki doz saati geldiğinde kart kendiliğinden ona geçer.
/// 3. Yoksa, saati henüz gelmemiş en yakın doz ("Bekliyor").
///
/// Sonraki saatlerin dozları ana ekranda ayrı kart olarak görünmez.
List<WorklistEntry> buildWorklist(
    List<MedicationSchedule> schedules, DateTime now) {
  final groups = <String, List<MedicationSchedule>>{};
  for (final s in schedules) {
    final key =
        s.prescriptionId ?? '${s.patientWristbandCode}|${s.medicationName}';
    groups.putIfAbsent(key, () => []).add(s);
  }

  final entries = <WorklistEntry>[];
  for (final doses in groups.values) {
    doses.sort((a, b) => a.scheduledTime.compareTo(b.scheduledTime));
    final actionable = doses.where((d) => d.isActionableAt(now)).toList();
    final administered = doses.where((d) => d.isAdministered).toList()
      ..sort((a, b) => (a.administeredAt ?? a.scheduledTime)
          .compareTo(b.administeredAt ?? b.scheduledTime));
    final upcoming =
        doses.where((d) => d.urgencyAt(now) == DoseUrgency.upcoming).toList();

    final MedicationSchedule shown;
    if (actionable.isNotEmpty) {
      shown = actionable
          .reduce((a, b) => _distance(a, now) <= _distance(b, now) ? a : b);
    } else if (administered.isNotEmpty) {
      shown = administered.last;
    } else if (upcoming.isNotEmpty) {
      shown = upcoming.first;
    } else {
      continue;
    }

    final otherOverdue = doses
        .where((d) => d != shown && d.urgencyAt(now) == DoseUrgency.overdue)
        .length;
    final next = doses
        .where((d) =>
            d != shown &&
            d.isOpen &&
            d.scheduledTime.isAfter(shown.scheduledTime))
        .firstOrNull;

    entries.add(WorklistEntry(
      dose: shown,
      otherOverdueCount: otherOverdue,
      nextDoseAt: next?.scheduledTime,
    ));
  }
  return entries;
}

Duration _distance(MedicationSchedule s, DateTime now) =>
    s.scheduledTime.difference(now).abs();
