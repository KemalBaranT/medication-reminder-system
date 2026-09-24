import 'package:flutter_test/flutter_test.dart';
import 'package:ilac_takip_mobile/models/medication_schedule.dart';
import 'package:ilac_takip_mobile/models/worklist.dart';

void main() {
  final now = DateTime(2026, 9, 24, 10, 5);

  MedicationSchedule dose(
    String id,
    int hour, {
    String status = 'pending',
    String prescriptionId = 'rx-parol',
    String medicationName = 'Parol',
    DateTime? administeredAt,
  }) =>
      MedicationSchedule(
        id: id,
        prescriptionId: prescriptionId,
        patientName: 'Kemal Baran',
        roomNo: '133',
        medicationName: medicationName,
        dosage: '500 mg',
        scheduledTime: DateTime(2026, 9, 24, hour),
        status: status,
        patientWristbandCode: 'BLK-1',
        medicationBarcode: '8690000000001',
        administeredAt: administeredAt,
      );

  test('aynı reçetenin dozları tek karta iner, şu ana en yakın doz gösterilir',
      () {
    final entries = buildWorklist([
      dose('d08', 8, status: 'missed'),
      dose('d10', 10, status: 'notified'),
      dose('d12', 12),
      dose('d14', 14),
    ], now);

    expect(entries, hasLength(1));
    expect(entries.single.dose.id, 'd10');
    expect(entries.single.otherOverdueCount, 1);
    expect(entries.single.nextDoseAt, DateTime(2026, 9, 24, 12));
  });

  test('aynı hastanın farklı ilaçları ayrı kart olarak kalır', () {
    final entries = buildWorklist([
      dose('p10', 10, status: 'notified'),
      dose('a10', 10,
          status: 'notified',
          prescriptionId: 'rx-antibiyotik',
          medicationName: 'Antibiyotik'),
    ], now);

    expect(entries.map((e) => e.dose.id), unorderedEquals(['p10', 'a10']));
  });

  test('açık doz yoksa son verilen doz yeşil kart olarak gösterilir', () {
    final entries = buildWorklist([
      dose('d08', 8,
          status: 'administered',
          administeredAt: DateTime(2026, 9, 24, 8, 12)),
      dose('d16', 16),
    ], now);

    expect(entries.single.dose.id, 'd08');
    expect(entries.single.nextDoseAt, DateTime(2026, 9, 24, 16));
  });

  test('yalnızca ileri saatli doz varsa en yakını "Bekliyor" olarak gelir',
      () {
    final entries = buildWorklist([dose('d20', 20), dose('d16', 16)], now);

    expect(entries.single.dose.id, 'd16');
    expect(entries.single.dose.urgencyAt(now), DoseUrgency.upcoming);
  });
}
