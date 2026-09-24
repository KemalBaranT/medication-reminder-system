import 'package:flutter_test/flutter_test.dart';
import 'package:ilac_takip_mobile/models/dose_slot.dart';

void main() {
  final planned = DateTime(2026, 9, 24, 14, 0);

  DoseSlot slot(String status, {DateTime? at}) =>
      DoseSlot(id: 'sch-1', scheduledTime: at ?? planned, status: status);

  test('15 dk tolerans içindeki sapma zamanında sayılır', () {
    final timing = DoseTiming.between(planned, DateTime(2026, 9, 24, 14, 12));
    expect(timing.kind, DoseTimingKind.onTime);
    expect(timing.label, 'Zamanında');
  });

  test('geç ve erken uygulama, sapma süresiyle birlikte etiketlenir', () {
    expect(DoseTiming.between(planned, DateTime(2026, 9, 24, 14, 18)).label,
        '18 dk geç');
    expect(DoseTiming.between(planned, DateTime(2026, 9, 24, 15, 25)).label,
        '1 sa 25 dk geç');
    expect(DoseTiming.between(planned, DateTime(2026, 9, 24, 13, 30)).label,
        '30 dk erken');
  });

  test(
      'İlacı Ver eylemi yalnızca açık ve erken pencereye girmiş dozlarda sunulur',
      () {
    final now = DateTime(2026, 9, 24, 13, 10);
    expect(slot('pending').isActionable(now), isTrue);
    expect(slot('missed').isActionable(now), isTrue);
    expect(slot('administered').isActionable(now), isFalse);
    expect(slot('skipped').isActionable(now), isFalse);
    expect(slot('pending', at: DateTime(2026, 9, 24, 20, 0)).isActionable(now),
        isFalse);
  });

  test('markAdministered gerçek uygulama zamanını planlanandan ayrı tutar', () {
    final given = slot('notified')
        .markAdministered(at: DateTime(2026, 9, 24, 14, 18), byName: 'Elif');
    expect(given.isAdministered, isTrue);
    expect(given.scheduledTime, planned);
    expect(given.administeredTiming?.label, '18 dk geç');
  });
}
