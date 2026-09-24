import 'dose_slot.dart';

/// `GET /prescriptions/patient/:patientId` için sadeleştirilmiş bir okuma
/// modeli; `PatientDetailScreen`'in hasta dosyası görüntüsünü besler. Web
/// panelinin eşdeğerinden kasıtlı olarak daha dardır (düzenle/iptal
/// eylemleri yok), çünkü bu ekran hızlı bir yatak başı/vizit sorgusu
/// içindir - "bu hasta şu an ne kullanıyor, sıradaki dozu verildi mi" -
/// web panelinin sorumluluğunda kalan tam reçete yönetimi için değildir.
/// Dozlar ([doses]) yalnızca hemşirenin bu ekrandan "İlacı Ver" eylemini
/// yapabilmesi ve verilmiş dozların denetim bilgisini görebilmesi için
/// taşınır.
class PrescriptionSummary {
  final String id;
  final String medicationName;
  final String dosage;
  final String? route;
  final int frequencyHours;
  final String status;

  /// İlaç kataloğundaki barkod; hasta dosyasından başlatılan QR
  /// doğrulamasının ikinci adımında beklenen koddur. Katalogda tanımlı
  /// değilse boştur.
  final String? medicationBarcode;

  /// Doktorun hemşireye uygulama talimatı; onay penceresinde dikkat çekici
  /// şekilde tekrar gösterilir.
  final String? nurseNote;

  /// Kronolojik sıralı planlanmış dozlar (backend `scheduledTime asc` döner).
  final List<DoseSlot> doses;

  PrescriptionSummary({
    required this.id,
    required this.medicationName,
    required this.dosage,
    this.route,
    required this.frequencyHours,
    required this.status,
    this.medicationBarcode,
    this.nurseNote,
    this.doses = const [],
  });

  factory PrescriptionSummary.fromJson(Map<String, dynamic> json) =>
      PrescriptionSummary(
        id: json['id'] as String,
        medicationName:
            (json['medication'] as Map<String, dynamic>)['name'] as String,
        dosage: json['dosage'] as String,
        route: json['route'] as String?,
        frequencyHours: json['frequencyHours'] as int,
        status: json['status'] as String,
        medicationBarcode:
            (json['medication'] as Map<String, dynamic>)['barcode'] as String?,
        nurseNote: json['nurseNote'] as String?,
        doses: ((json['schedules'] as List<dynamic>?) ?? const [])
            .map((e) => DoseSlot.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  /// Tek bir dozu değiştirilmiş yeni reçete; ekranın canlı güncellemesi için.
  PrescriptionSummary replaceDose(DoseSlot updated) => PrescriptionSummary(
        id: id,
        medicationName: medicationName,
        dosage: dosage,
        route: route,
        frequencyHours: frequencyHours,
        status: status,
        medicationBarcode: medicationBarcode,
        nurseNote: nurseNote,
        doses: [for (final d in doses) d.id == updated.id ? updated : d],
      );

  bool get isActive => status == 'active';

  /// Şu an uygulanabilir en erken doz (gecikmişler önce gelir), yoksa null.
  DoseSlot? nextActionableDose(DateTime now) {
    if (!isActive) return null;
    for (final d in doses) {
      if (d.isActionable(now)) return d;
    }
    return null;
  }

  /// En son "Verildi" kaydedilen doz; kartta son uygulama bilgisi olarak
  /// gösterilir.
  DoseSlot? get lastAdministeredDose {
    DoseSlot? last;
    for (final d in doses) {
      if (d.isAdministered &&
          (last == null ||
              (d.administeredAt ?? d.scheduledTime)
                  .isAfter(last.administeredAt ?? last.scheduledTime))) {
        last = d;
      }
    }
    return last;
  }

  static const statusLabels = {
    'active': 'Aktif',
    'completed': 'Tamamlandı',
    'cancelled': 'İptal Edildi',
  };

  String get statusLabel => statusLabels[status] ?? status;
}
