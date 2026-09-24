import 'package:flutter_test/flutter_test.dart';
import 'package:ilac_takip_mobile/models/medication_schedule.dart';

Map<String, dynamic> _json(
        {String status = 'notified', String? administeredAt}) =>
    {
      'id': 'sch-1',
      'patientName': 'Ayşe Yılmaz',
      'roomNo': '133',
      'medicationName': 'Parol',
      'dosage': '500 mg',
      'scheduledTime': '2026-09-23T08:00:00.000Z',
      'status': status,
      'patientWristbandCode': 'BLK-1',
      'medicationBarcode': '8690000000001',
      if (administeredAt != null) 'administeredAt': administeredAt,
      if (administeredAt != null) 'administeredByName': 'Hemşire Elif',
    };

void main() {
  test('acik doz uygulanabilir, verilmis doz uygulanamaz', () {
    final open = MedicationSchedule.fromJson(_json());
    expect(open.isOpen, isTrue);
    expect(open.isAdministered, isFalse);

    final done = MedicationSchedule.fromJson(_json(
        status: 'administered', administeredAt: '2026-09-23T08:05:00.000Z'));
    expect(done.isOpen, isFalse);
    expect(done.isAdministered, isTrue);
    expect(done.isLate, isFalse,
        reason: 'Verilmis bir doz "Gecikti" filtresinde gorunmemeli.');
    expect(done.administeredAt, DateTime.utc(2026, 9, 23, 8, 5).toLocal());
    expect(done.administeredByName, 'Hemşire Elif');
  });

  test('markAdministered denetim bilgisini tasir, diger alanlari korur', () {
    final at = DateTime(2026, 9, 23, 14, 32);
    final done = MedicationSchedule.fromJson(_json())
        .markAdministered(at: at, byName: 'Hemşire Elif', syncPending: true);
    expect(done.status, 'administered');
    expect(done.administeredAt, at);
    expect(done.syncPending, isTrue);
    expect(done.medicationBarcode, '8690000000001');
    expect(done.patientWristbandCode, 'BLK-1');
  });
}
