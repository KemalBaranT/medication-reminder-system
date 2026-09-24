import 'package:flutter_test/flutter_test.dart';
import 'package:ilac_takip_mobile/models/medication_schedule.dart';

void main() {
  final now = DateTime(2026, 9, 24, 14, 0);

  MedicationSchedule dose(String status, DateTime at) => MedicationSchedule(
        id: '$status-${at.toIso8601String()}',
        patientName: 'Kemal Baran',
        roomNo: '133',
        medicationName: 'Parol',
        dosage: '500 mg',
        scheduledTime: at,
        status: status,
        patientWristbandCode: 'BLK-1',
        medicationBarcode: '8690000000001',
      );

  test('aciliyet kademeleri: gecikmiş, saati gelmiş, bekleyen, verilmiş', () {
    expect(dose('notified', DateTime(2026, 9, 24, 13, 30)).urgencyAt(now),
        DoseUrgency.overdue);
    expect(dose('missed', DateTime(2026, 9, 24, 9, 0)).urgencyAt(now),
        DoseUrgency.overdue);
    expect(dose('notified', DateTime(2026, 9, 24, 13, 50)).urgencyAt(now),
        DoseUrgency.due);
    expect(dose('pending', DateTime(2026, 9, 24, 14, 40)).urgencyAt(now),
        DoseUrgency.due);
    expect(dose('pending', DateTime(2026, 9, 24, 20, 0)).urgencyAt(now),
        DoseUrgency.upcoming);
    expect(dose('administered', DateTime(2026, 9, 24, 8, 0)).urgencyAt(now),
        DoseUrgency.done);
  });

  test('kaydırarak verme yalnızca saati gelmiş veya gecikmiş dozlarda açık',
      () {
    expect(dose('missed', DateTime(2026, 9, 24, 9, 0)).isActionableAt(now),
        isTrue);
    expect(dose('pending', DateTime(2026, 9, 24, 14, 30)).isActionableAt(now),
        isTrue);
    expect(dose('pending', DateTime(2026, 9, 24, 20, 0)).isActionableAt(now),
        isFalse);
    expect(
        dose('administered', DateTime(2026, 9, 24, 13, 0)).isActionableAt(now),
        isFalse);
  });

  test('kaçırılmış doz açık sayılır, geç de olsa verilebilir', () {
    expect(dose('missed', DateTime(2026, 9, 24, 9, 0)).isOpen, isTrue);
  });
}
