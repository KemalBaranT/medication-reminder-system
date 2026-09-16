class MedicationSchedule {
  final String id;
  final String patientName;
  final String roomNo;
  final String medicationName;
  final String dosage;
  final DateTime scheduledTime;
  final String status;
  final String patientWristbandCode;
  final String medicationBarcode;

  MedicationSchedule({
    required this.id,
    required this.patientName,
    required this.roomNo,
    required this.medicationName,
    required this.dosage,
    required this.scheduledTime,
    required this.status,
    required this.patientWristbandCode,
    required this.medicationBarcode,
  });

  factory MedicationSchedule.fromJson(Map<String, dynamic> json) {
    return MedicationSchedule(
      id: json['id'] as String,
      patientName: json['patientName'] as String,
      roomNo: json['roomNo'] as String? ?? '',
      medicationName: json['medicationName'] as String,
      dosage: json['dosage'] as String,
      scheduledTime: DateTime.parse(json['scheduledTime'] as String),
      status: json['status'] as String,
      patientWristbandCode: json['patientWristbandCode'] as String? ?? '',
      medicationBarcode: json['medicationBarcode'] as String? ?? '',
    );
  }
}
