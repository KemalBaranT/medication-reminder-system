import 'package:flutter/material.dart';

import '../models/dose_target.dart';
import '../widgets/advanced_qr_scanner.dart';

enum _ScanStep { patient, medication }

/// İlaç uygulama akışının "QR ile Hızlı Onayla" yolu: yatak başı barkod
/// doğrulaması. Hemşire önce hasta bilekliğini, sonra ilaç kutusunu
/// okutur; ikisi de bu dozun beklenen kodlarıyla eşleşmeden doğrulama
/// tamamlanmaz. Bu, "beş doğru" ilkesinin doğru hasta + doğru ilaç
/// ayağıdır.
///
/// **Sorumluluk sınırı:** Bu ekran hiçbir kayıt yapmaz; yalnızca
/// doğrulamanın sonucunu ([DoseVerification]) döndürür ve kapanır. Kaydın
/// kendisi manuel yol ile aynı "İlaç Onayı" penceresinde ([DoseConfirmDialog]),
/// aynı kurallarla yapılır (bkz. `scanAndAdministerDose`). Böylece iki
/// yolun tek farkı denetim kaydındaki doğrulama bilgisidir. İki barkodun
/// eşleşmesi ilacın *hazır* olduğunu kanıtlar, *verildiğini* değil; bu
/// yüzden kayıt kendiliğinden yapılmaz, hemşirenin onayını bekler.
///
/// **Tek tarayıcı:** Tarama deneyimi, ana sayfadaki "QR Tara" butonuyla
/// açılan bileklik sorgusunda da kullanılan global [AdvancedQrScanner]
/// bileşenindedir (lazer vizör, galeriden okuma, hata bandı). Galeriden
/// okunan kodlar kabul edilir ancak [DoseVerification.usedGallery] olarak
/// işaretlenir ve kayıt "barkod doğrulamalı" sayılmaz.
///
/// İlaç kataloğunda barkodu tanımlı olmayan ilaçlarda ikinci adım
/// atlanır; kayıt yalnızca hasta doğrulamasıyla ilerler ve onay penceresi bu
/// durumu açıkça belirtir.
class ScanMatchScreen extends StatefulWidget {
  const ScanMatchScreen({super.key, required this.target});

  final DoseTarget target;

  @override
  State<ScanMatchScreen> createState() => _ScanMatchScreenState();
}

class _ScanMatchScreenState extends State<ScanMatchScreen> {
  _ScanStep _step = _ScanStep.patient;
  bool _usedGallery = false;

  /// Okutulan her kodu bulunulan adımın beklenen değeriyle karşılaştırır.
  /// Eşleşmeyen bir kod adımı ilerletmez ve tarayıcının hata bandında
  /// gösterilir. Son adım da eşleştiğinde tarayıcı başarı animasyonunu
  /// gösterir ve ekran doğrulama sonucuyla kapanır.
  Future<QrScanDecision> _onCode(String code, QrScanSource source) async {
    final t = widget.target;
    if (_step == _ScanStep.patient) {
      if (code != t.patientWristbandCode) {
        return QrScanDecision.reject(
            'Yanlış hasta bilekliği! Bu ilaç ${t.patientName} için.');
      }
      _usedGallery |= source == QrScanSource.gallery;
      if (!t.hasMedicationBarcode) {
        return QrScanDecision.complete('Hasta doğrulandı: ${t.patientName}',
            onShown: () => _finish(medicationScanned: false));
      }
      setState(() => _step = _ScanStep.medication);
      return QrScanDecision.accept('Hasta doğrulandı: ${t.patientName}');
    }

    if (code != t.medicationBarcode) {
      return QrScanDecision.reject(
          'Yanlış ilaç! Beklenen: ${t.medicationName}');
    }
    _usedGallery |= source == QrScanSource.gallery;
    return QrScanDecision.complete('İlaç doğrulandı',
        onShown: () => _finish(medicationScanned: true));
  }

  void _finish({required bool medicationScanned}) {
    Navigator.of(context).pop(DoseVerification(
      patientScanned: true,
      medicationScanned: medicationScanned,
      usedGallery: _usedGallery,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final onPatientStep = _step == _ScanStep.patient;
    final totalSteps = widget.target.hasMedicationBarcode ? 2 : 1;
    return Scaffold(
      appBar: AppBar(
        title: Text(onPatientStep
            ? 'Adım 1/$totalSteps · Hasta Bilekliği'
            : 'Adım 2/2 · İlaç Barkodu'),
      ),
      body: AdvancedQrScanner(
        instruction: onPatientStep
            ? 'Hasta bilekliğini okutun'
            : 'İlaç kutusunu okutun: ${widget.target.medicationName}',
        onCode: _onCode,
      ),
    );
  }
}
