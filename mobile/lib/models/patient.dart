/// Backend'in `GET /patients` yanitindaki bir hasta kaydinin mobil karsiligi.
/// Salt-okunur bir goruntuleme modelidir; hasta ekleme/duzenleme yalnizca
/// web panelinden yapilir.
class Patient {
  final String id;
  final String hospitalPatientNo;
  final String fullName;
  final String? floor;
  final String? roomNo;
  final String? bedNo;
  final String wristbandCode;
  final String status;

  Patient({
    required this.id,
    required this.hospitalPatientNo,
    required this.fullName,
    this.floor,
    this.roomNo,
    this.bedNo,
    required this.wristbandCode,
    required this.status,
  });

  factory Patient.fromJson(Map<String, dynamic> json) => Patient(
        id: json['id'] as String,
        hospitalPatientNo: json['hospitalPatientNo'] as String,
        fullName: json['fullName'] as String,
        floor: json['floor'] as String?,
        roomNo: json['roomNo'] as String?,
        bedNo: json['bedNo'] as String?,
        wristbandCode: json['wristbandCode'] as String,
        status: json['status'] as String,
      );

  /// "3. Kat - Oda 133 - Yatak 7" seklinde, eksik alanlari atlayan lokasyon metni.
  String get locationLabel {
    final parts = <String>[
      if (floor != null && floor!.isNotEmpty) '$floor. Kat',
      if (roomNo != null && roomNo!.isNotEmpty) 'Oda $roomNo',
      if (bedNo != null && bedNo!.isNotEmpty) 'Yatak $bedNo',
    ];
    return parts.isEmpty ? '-' : parts.join(' - ');
  }

  static const statusLabels = {
    'admitted': 'Yatıyor',
    'discharged': 'Taburcu',
    'transferred': 'Nakil',
  };

  String get statusLabel => statusLabels[status] ?? status;
}
