import 'dose_slot.dart';

/// Backend'in `GET /schedule/mine` yanıtındaki tek bir planlanmış dozun
/// mobil karşılığı; hemşirenin "Bugünün İlaçları" listesindeki her kartı
/// besler. Liste hem açık dozları hem de bugün "Verildi" olarak kaydedilmiş
/// dozları içerir; ikincilerde denetim bilgisi ([administeredAt],
/// [administeredByName]) doludur.
class MedicationSchedule {
  final String id;

  /// Dozun ait olduğu reçete. İş listesi, aynı ilacın gün içindeki dozlarını
  /// bu alana göre gruplayıp reçete başına tek kart gösterir (bkz.
  /// `buildWorklist`). Alanı döndürmeyen eski bir sunucuya karşı boş
  /// kalabilir; bu durumda gruplama hasta + ilaç adına göre yapılır.
  final String? prescriptionId;
  final String patientName;
  final String? floor;
  final String roomNo;
  final String? bedNo;
  final String medicationName;
  final String dosage;
  final DateTime scheduledTime;
  final String status;
  final String patientWristbandCode;
  final String medicationBarcode;
  final String? nurseNote;
  final String? prescribedByName;
  final String? prescribedByTitle;

  /// Dozun "Verildi" olarak kaydedildiği an (AdministrationLog.performedAt).
  final DateTime? administeredAt;

  /// Dozu kaydeden personelin adı; kartta denetim izi olarak gösterilir.
  final String? administeredByName;

  /// Yalnızca istemci tarafında anlamlı: kayıt çevrimdışı kuyrukta bekliyor,
  /// sunucuya henüz ulaşmadı. Kart bu durumda "Verildi" etiketinin yanında
  /// senkron beklediğini de belirtir; hemşireye kaydın kaybolmadığını ama
  /// henüz merkezi sistemde görünmediğini dürüstçe söyler.
  final bool syncPending;

  MedicationSchedule({
    required this.id,
    this.prescriptionId,
    required this.patientName,
    this.floor,
    required this.roomNo,
    this.bedNo,
    required this.medicationName,
    required this.dosage,
    required this.scheduledTime,
    required this.status,
    required this.patientWristbandCode,
    required this.medicationBarcode,
    this.nurseNote,
    this.prescribedByName,
    this.prescribedByTitle,
    this.administeredAt,
    this.administeredByName,
    this.syncPending = false,
  });

  factory MedicationSchedule.fromJson(Map<String, dynamic> json) {
    return MedicationSchedule(
      id: json['id'] as String,
      prescriptionId: json['prescriptionId'] as String?,
      patientName: json['patientName'] as String,
      floor: json['floor'] as String?,
      roomNo: json['roomNo'] as String? ?? '',
      bedNo: json['bedNo'] as String?,
      medicationName: json['medicationName'] as String,
      dosage: json['dosage'] as String,
      scheduledTime: DateTime.parse(json['scheduledTime'] as String),
      status: json['status'] as String,
      patientWristbandCode: json['patientWristbandCode'] as String? ?? '',
      medicationBarcode: json['medicationBarcode'] as String? ?? '',
      nurseNote: json['nurseNote'] as String?,
      prescribedByName: json['prescribedByName'] as String?,
      prescribedByTitle: json['prescribedByTitle'] as String?,
      administeredAt: json['administeredAt'] == null
          ? null
          : DateTime.parse(json['administeredAt'] as String).toLocal(),
      administeredByName: json['administeredByName'] as String?,
    );
  }

  /// Dozun "Verildi" olarak kaydedildiği yeni halini döndürür. Liste,
  /// sunucudan yeniden çekilmeyi beklemeden kartı anında yeşil "Verildi"
  /// etiketiyle gösterebilsin diye [AppState] tarafından kullanılır.
  MedicationSchedule markAdministered({
    required DateTime at,
    String? byName,
    bool syncPending = false,
  }) {
    return MedicationSchedule(
      id: id,
      prescriptionId: prescriptionId,
      patientName: patientName,
      floor: floor,
      roomNo: roomNo,
      bedNo: bedNo,
      medicationName: medicationName,
      dosage: dosage,
      scheduledTime: scheduledTime,
      status: 'administered',
      patientWristbandCode: patientWristbandCode,
      medicationBarcode: medicationBarcode,
      nurseNote: nurseNote,
      prescribedByName: prescribedByName,
      prescribedByTitle: prescribedByTitle,
      administeredAt: at,
      administeredByName: byName,
      syncPending: syncPending,
    );
  }

  /// Dozun klinik sonucu henüz kaydedilmemiş mi. Eskalasyonla `missed`
  /// durumuna düşmüş bir doz da açıktır: backend geç de olsa kaydedilmesine
  /// izin verir ve iş listesi onu en acil doz olarak gösterir.
  bool get isOpen => DoseTimingRules.openStatuses.contains(status);

  bool get isAdministered => status == 'administered';

  /// "Dr. Mehmet Yılmaz - Genel Cerrah" gibi, unvan varsa ada ekleyen biçim.
  String? get prescriberDisplay {
    if (prescribedByName == null || prescribedByName!.isEmpty) return null;
    if (prescribedByTitle == null || prescribedByTitle!.isEmpty) {
      return prescribedByName;
    }
    return '$prescribedByName - $prescribedByTitle';
  }

  /// "3. Kat - Oda 133 - Yatak 7" şeklinde, eksik alanları atlayan lokasyon metni.
  String get locationLabel {
    final parts = <String>[
      if (floor != null && floor!.isNotEmpty) '$floor. Kat',
      if (roomNo.isNotEmpty) 'Oda $roomNo',
      if (bedNo != null && bedNo!.isNotEmpty) 'Yatak $bedNo',
    ];
    return parts.isEmpty ? '-' : parts.join(' - ');
  }

  /// Bir dozun "gecikti" sayılması için tek kural: açık olması ve planlanan
  /// saatin tolerans payından ([DoseTimingRules.onTimeTolerance]) fazla
  /// geçmiş olması. Kural bildirim durumuna değil saate bakar; bildirim
  /// altyapısı gecikse veya çalışmasa da geciken doz kırmızı görünür. Kartın
  /// kırmızı vurgusu, durum filtresindeki "Gecikti" seçeneği ve listenin
  /// aciliyet sıralaması aynı kaynaktan beslenir; hasta dosyasındaki
  /// [DoseSlot.isOverdue] ile de aynı eşiği kullanır.
  bool get isLate => urgencyAt(DateTime.now()) == DoseUrgency.overdue;

  /// Dozun verilen andaki aciliyet kademesi; iş listesinin sıralama
  /// anahtarıdır (bkz. [DoseUrgency]).
  DoseUrgency urgencyAt(DateTime now) {
    if (!isOpen) return DoseUrgency.done;
    final timing = DoseTiming.between(scheduledTime.toLocal(), now);
    if (timing.kind == DoseTimingKind.late) return DoseUrgency.overdue;
    if (scheduledTime.toLocal().difference(now) <=
        DoseTimingRules.earlyWindow) {
      return DoseUrgency.due;
    }
    return DoseUrgency.upcoming;
  }

  /// Doz şu an kaydırarak verilebilir mi: açık ve erken uygulama
  /// penceresine girmiş olmalıdır. Saati henüz gelmemiş (örneğin akşam)
  /// dozlarda kaydırma kapalıdır; hızlı bir hareketin yanlış dozu
  /// kapatmasını önleyen tek koruma budur.
  bool isActionableAt(DateTime now) =>
      urgencyAt(now) == DoseUrgency.overdue ||
      urgencyAt(now) == DoseUrgency.due;
}

/// İş listesindeki bir dozun aciliyet kademesi. Değerlerin sırası listenin
/// yukarıdan aşağıya sırasıdır: en acil olan en üstte.
enum DoseUrgency {
  /// Planlanan saati tolerans payından fazla geçmiş (Gecikti / Kaçırıldı).
  overdue,

  /// Saati gelmiş veya erken uygulama penceresi içinde.
  due,

  /// Saati henüz gelmemiş (örneğin akşam dozu).
  upcoming,

  /// Klinik sonucu kaydedilmiş (Verildi); vardiya özeti olarak en altta.
  done,
}
