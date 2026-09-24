import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_service.dart';
import '../state/app_state.dart';
import '../widgets/advanced_qr_scanner.dart';
import 'patient_detail_screen.dart';

/// Her rol için [HomeScreen]'deki global "QR Tara" FloatingActionButton'ı
/// üzerinden ulaşılan genel amaçlı bileklik sorgusu. Tek bir doza bağlı
/// olan ve dozun uygulanmasını doğrulayan [ScanMatchScreen]'den farklı
/// olarak bu ekran daha basit bir soruyu yanıtlar - "bu kimin bilekliği" -
/// ve hasta dosyasına ([PatientDetailScreen]) devreder. Kendisi hiçbir
/// yazma uç noktası çağırmaz; bu yüzden oturum açmış olmanın ötesinde rol
/// kısıtlaması taşımaz.
///
/// Tarama deneyiminin tamamı (kamera, lazer vizör, galeriden okuma, hata
/// bandı) uygulamadaki tek tarayıcı bileşeni olan [AdvancedQrScanner]'dadır;
/// ilaç uygulama akışındaki QR doğrulaması da birebir aynı bileşeni
/// kullanır. Bu ekran yalnızca okunan kodun hangi hastaya ait olduğunu
/// çözer.
class WristbandScanScreen extends StatelessWidget {
  const WristbandScanScreen({super.key});

  /// Bileklik kodunu backend'e sorup eşleşen hastayı bulur. Hasta
  /// bulunursa tarayıcının başarı animasyonundan sonra hasta dosyasına
  /// geçilir; `pushReplacement` ile tarama ekranı yığından çıkarılır ki geri
  /// tuşu kullanıcıyı aynı koda geri döndürmesin.
  Future<QrScanDecision> _resolveWristband(
      BuildContext context, String code) async {
    final appState = context.read<AppState>();
    final navigator = Navigator.of(context);
    try {
      final patient = await appState.lookupPatientByWristband(code);
      return QrScanDecision.complete(
        'Hasta bulundu: ${patient.fullName}',
        onShown: () => navigator.pushReplacement(
          MaterialPageRoute(
              builder: (_) => PatientDetailScreen(patient: patient)),
        ),
      );
    } on ApiException catch (e) {
      return QrScanDecision.reject(e.statusCode == 404
          ? 'Bu bileklik koduyla eşleşen hasta bulunamadı.'
          : e.message);
    } catch (_) {
      return const QrScanDecision.reject('Beklenmeyen bir hata oluştu.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Hasta Bilekliğini Okutun')),
      body: AdvancedQrScanner(
        instruction: 'Bilekliği çerçevenin içine hizalayın',
        onCode: (code, _) => _resolveWristband(context, code),
      ),
    );
  }
}
