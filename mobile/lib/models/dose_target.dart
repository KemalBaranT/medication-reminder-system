import 'dose_slot.dart';
import 'medication_schedule.dart';
import 'patient.dart';
import 'prescription_summary.dart';

/// Üzerinde işlem yapılacak tek bir dozun, ilaç uygulama akışının ihtiyaç
/// duyduğu bilgilerle birlikte ekrandan bağımsız temsili.
///
/// **Neden ayrı bir model:** Bir doza iki farklı yerden ulaşılır:
/// "Bugünün İlaçları" iş listesi ([MedicationSchedule]) ve bileklik
/// taramasıyla açılan hasta dosyası ([PrescriptionSummary] + [DoseSlot]).
/// Bu iki kaynağın veri şekli farklıdır; eylem menüsü, QR doğrulama
/// ekranı, onay penceresi ve "uygulanmadı" formu ise aynı bilgiyi ister.
/// Akışın tamamı bu tek model üzerinden çalıştığı için, iki giriş noktası
/// birebir aynı ekranları ve aynı iş kurallarını kullanır.
class DoseTarget {
  final String scheduleId;
  final DateTime scheduledTime;
  final String patientName;
  final String locationLabel;
  final String patientWristbandCode;
  final String medicationName;
  final String dosage;
  final String? route;

  /// İlaç kataloğundaki barkod. Katalogda barkod tanımlı olmayan ilaçlar
  /// için boştur; bu durumda QR akışı yalnızca hasta bilekliğini doğrular
  /// (bkz. [hasMedicationBarcode]).
  final String? medicationBarcode;
  final String? nurseNote;
  final String? prescriberDisplay;

  const DoseTarget({
    required this.scheduleId,
    required this.scheduledTime,
    required this.patientName,
    required this.locationLabel,
    required this.patientWristbandCode,
    required this.medicationName,
    required this.dosage,
    this.route,
    this.medicationBarcode,
    this.nurseNote,
    this.prescriberDisplay,
  });

  /// "Bugünün İlaçları" iş listesindeki bir karttan.
  factory DoseTarget.fromSchedule(MedicationSchedule s) => DoseTarget(
        scheduleId: s.id,
        scheduledTime: s.scheduledTime.toLocal(),
        patientName: s.patientName,
        locationLabel: s.locationLabel,
        patientWristbandCode: s.patientWristbandCode,
        medicationName: s.medicationName,
        dosage: s.dosage,
        medicationBarcode: s.medicationBarcode,
        nurseNote: s.nurseNote,
        prescriberDisplay: s.prescriberDisplay,
      );

  /// Hasta dosyasındaki bir reçetenin bir dozundan.
  factory DoseTarget.fromPrescription(
          Patient patient, PrescriptionSummary rx, DoseSlot dose) =>
      DoseTarget(
        scheduleId: dose.id,
        scheduledTime: dose.scheduledTime,
        patientName: patient.fullName,
        locationLabel: patient.locationLabel,
        patientWristbandCode: patient.wristbandCode,
        medicationName: rx.medicationName,
        dosage: rx.dosage,
        route: rx.route,
        medicationBarcode: rx.medicationBarcode,
        nurseNote: rx.nurseNote,
      );

  bool get hasMedicationBarcode =>
      medicationBarcode != null && medicationBarcode!.isNotEmpty;
}

/// Bir uygulama kaydının hangi doğrulamayla yapıldığı. Denetim kaydındaki
/// `barcodeVerified` alanı ve onay penceresinde hemşireye gösterilen
/// doğrulama satırları buradan türetilir.
///
/// QR doğrulaması artık zorunlu değil, süreci hızlandıran bir seçenektir;
/// bu yüzden kaydın *nasıl* doğrulandığı gizlenmez, açıkça işaretlenir:
/// kalite birimi manuel veya galeriden yapılan kayıtları, yatak başında
/// kamerayla doğrulanmış kayıtlardan raporlarda ayırt edebilir.
class DoseVerification {
  const DoseVerification({
    required this.patientScanned,
    required this.medicationScanned,
    required this.usedGallery,
  });

  /// QR kullanılmadan, hemşirenin beyanıyla yapılan kayıt.
  static const manual = DoseVerification(
      patientScanned: false, medicationScanned: false, usedGallery: false);

  final bool patientScanned;
  final bool medicationScanned;

  /// Kodlardan en az biri canlı kamera yerine galerideki bir fotoğraftan
  /// okundu. Fotoğraf, hemşirenin o an yatak başında olduğunu kanıtlamaz.
  final bool usedGallery;

  bool get isManual => !patientScanned && !medicationScanned;

  /// Denetim kaydına "barkod doğrulamalı" olarak geçer mi: hem bileklik
  /// hem ilaç barkodu, yatak başında canlı kamerayla okunmuş olmalıdır.
  bool get isBarcodeVerified =>
      patientScanned && medicationScanned && !usedGallery;
}
