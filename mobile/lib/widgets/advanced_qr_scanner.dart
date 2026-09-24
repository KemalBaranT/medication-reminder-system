import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../services/qr_image_decoder.dart';
import '../utils/list_extensions.dart';
import 'qr_scan_preview.dart';

/// Okutulan kodun nereden geldiği. Tarayıcı iki kaynağı da aynı karar
/// mekanizmasından geçirir; kaynağı yine de her koda eşlik ettirir, çünkü
/// ilaç uygulama akışı denetim kaydında bu ayrımı korur (bkz.
/// `DoseVerification.usedGallery`).
enum QrScanSource { camera, gallery }

enum _DecisionKind { accept, complete, reject }

/// Ekranın, okutulan bir koda verdiği yanıt. Tarayıcı bu yanıta göre
/// görsel geribildirimi (yeşil parlama, hata bandı) kendisi yönetir; ekran
/// yalnızca iş kuralını bilir.
class QrScanDecision {
  /// Kod geçerli ama iş akışı devam ediyor (örneğin bileklik doğrulandı,
  /// şimdi ilaç barkodu bekleniyor). Vizör kısa bir yeşil parlama yapar ve
  /// taramaya devam eder.
  const QrScanDecision.accept(this.message)
      : _kind = _DecisionKind.accept,
        onShown = null;

  /// Kod iş akışını tamamladı. Vizör yeşil parlar, yeni kodlar artık kabul
  /// edilmez ve başarı animasyonu kullanıcıya gösterildikten sonra
  /// [onShown] çağrılır (örneğin sonraki ekrana geçiş).
  const QrScanDecision.complete(this.message,
      {required VoidCallback this.onShown})
      : _kind = _DecisionKind.complete;

  /// Kod reddedildi (yanlış hasta, yanlış ilaç, kayıt bulunamadı). Mesaj
  /// hata bandında gösterilir ve tarama devam eder.
  const QrScanDecision.reject(this.message)
      : _kind = _DecisionKind.reject,
        onShown = null;

  final _DecisionKind _kind;
  final String message;
  final VoidCallback? onShown;
}

/// Bir kodu iş kuralına göre değerlendiren ekran taraflı geri çağırma.
typedef QrCodeHandler = Future<QrScanDecision> Function(
    String code, QrScanSource source);

/// Uygulamadaki tüm QR/barkod tarama ekranlarının ortak gövdesi: canlı
/// kamera, lazer tarama animasyonlu vizör, hata bandı ve galeriden
/// fotoğrafla okuma.
///
/// **Neden tek bileşen:** Tarama deneyimi daha önce her ekranda ayrı ayrı
/// kurulmuştu; bu, ekranlar arasında farklı davranışlara (birinde animasyon
/// var, diğerinde yok; birinde tekrar eden hata spamı, diğerinde yok) yol
/// açıyordu. Bu bileşen tüm görsel ve zamanlama davranışını tek yerde
/// toplar; ekranlar yalnızca [onCode] ile "bu kod benim akışım için ne
/// ifade ediyor" sorusunu yanıtlar. Böylece bir hemşire ister ana sayfadaki
/// "QR Tara" butonundan, ister iş listesindeki bir ilaç kartından gelsin
/// aynı vizörü, aynı lazeri ve aynı başarı/hata dilini görür.
///
/// **Galeri politikası:** "Galeriden Seç" her ekranda sunulur. QR
/// doğrulaması sistemde zorunlu bir adım değil, süreci hızlandıran bir
/// seçenektir: bileklik kopmuş, kamera arızalı veya kod ekrandan
/// okunamıyor olabilir, ve manuel kayıt her zaman mümkündür. Bu durumda
/// galeriden okumayı yasaklamak güvenlik sağlamaz, yalnızca personeli daha
/// az kanıtlı olan manuel yola iter. Klinik risk bunun yerine kayıt
/// düzeyinde yönetilir: galeriden okunan bir kod ekrana [QrScanSource.gallery]
/// olarak iletilir ve ilaç uygulama akışı böyle bir kaydı "barkod
/// doğrulamalı" saymaz; kalite birimi bu kayıtları raporlarda ayırt eder.
class AdvancedQrScanner extends StatefulWidget {
  const AdvancedQrScanner({
    super.key,
    required this.onCode,
    required this.instruction,
  });

  final QrCodeHandler onCode;

  /// Vizörün altında gösterilen yönerge ("Hasta bilekliğini okutun" gibi).
  /// Ekran adım değiştirdikçe güncelleyebilir.
  final String instruction;

  @override
  State<AdvancedQrScanner> createState() => _AdvancedQrScannerState();
}

class _AdvancedQrScannerState extends State<AdvancedQrScanner> {
  /// Kod anında çözülse bile kullanıcının lazer animasyonunu ve hangi
  /// fotoğrafın işlendiğini algılayabileceği en kısa galeri tarama süresi.
  static const _minimumGalleryScanDuration = Duration(milliseconds: 1400);

  /// İş akışını tamamlayan başarı parlamasının, [QrScanDecision.onShown]
  /// çağrılmadan önce ekranda kalacağı süre.
  static const _successHoldDuration = Duration(milliseconds: 900);

  /// Ara adım kabullerindeki (örneğin bileklik doğrulandı) kısa yeşil
  /// parlamanın süresi; akışı yavaşlatmadan adım geçişini hissettirir.
  static const _acceptFlashDuration = Duration(milliseconds: 700);

  /// Aynı reddedilmiş kodun tekrar değerlendirilmeden önce bekleneceği
  /// süre. Kamera aynı kodu saniyede onlarca kez raporlar; bu olmadan hata
  /// bandı titrer ve her karede bir ağ isteği atılabilirdi.
  static const _rejectCooldown = Duration(milliseconds: 2500);

  /// Canlı kamera önizlemesini beslediği gibi, [QrImageDecoder]'in galeriden
  /// seçilen statik görüntüyü aynı yerel tarayıcı motoruyla analiz
  /// edebilmesi için de açıkça oluşturulur.
  final _controller = MobileScannerController();
  late final _imageDecoder = QrImageDecoder(_controller);

  bool _busy = false;
  bool _completed = false;
  bool _flashing = false;
  String? _error;
  String? _statusOverride;

  /// Kabul edilmiş kodlar bu tarayıcı ömrü boyunca bir daha
  /// değerlendirilmez: bileklik doğrulandıktan sonra hâlâ kadrajda duran
  /// bileklik, ikinci adımda "yanlış ilaç" hatası üretmemelidir.
  final _acceptedCodes = <String>{};
  String? _lastRejectedCode;
  DateTime? _lastRejectedAt;

  File? _previewImage;
  QrScanPreviewStatus _previewStatus = QrScanPreviewStatus.scanning;
  String _previewMessage = '';

  /// Her galeri taramasında artan oturum sayacı. Kullanıcı tarama sürerken
  /// önizlemeyi kapatır veya yeni bir fotoğraf seçerse, eski taramanın geç
  /// gelen sonucu bu sayaç eşleşmediği için yok sayılır.
  int _gallerySession = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  bool get _acceptingCodes => !_busy && !_completed && _previewImage == null;

  /// Canlı kameradan gelen tespitleri, tekrar ve spam filtrelerinden
  /// geçirdikten sonra ekranın iş kuralına iletir.
  Future<void> _onDetect(BarcodeCapture capture) async {
    if (!_acceptingCodes) return;
    final code = capture.barcodes.firstOrNull?.rawValue;
    if (code == null || _acceptedCodes.contains(code)) return;
    if (code == _lastRejectedCode &&
        _lastRejectedAt != null &&
        DateTime.now().difference(_lastRejectedAt!) < _rejectCooldown) {
      return;
    }

    setState(() {
      _busy = true;
      _statusOverride = 'Kod okundu, doğrulanıyor…';
    });
    final decision = await widget.onCode(code, QrScanSource.camera);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _statusOverride = null;
    });
    await _applyDecision(code, decision);
  }

  /// Ekranın kararını görsel geribildirime çevirir. Bu, hem kamera hem
  /// galeri yolunun ortak son adımıdır; böylece aynı karar her kaynakta
  /// aynı şekilde gösterilir.
  Future<void> _applyDecision(String code, QrScanDecision decision) async {
    switch (decision._kind) {
      case _DecisionKind.reject:
        _lastRejectedCode = code;
        _lastRejectedAt = DateTime.now();
        if (_previewImage != null) {
          setState(() {
            _previewStatus = QrScanPreviewStatus.failure;
            _previewMessage = decision.message;
          });
        } else {
          setState(() => _error = decision.message);
        }
      case _DecisionKind.accept:
        _acceptedCodes.add(code);
        setState(() {
          _error = null;
          _previewImage = null;
          _flashing = true;
          _statusOverride = decision.message;
        });
        await Future<void>.delayed(_acceptFlashDuration);
        if (!mounted) return;
        setState(() {
          _flashing = false;
          _statusOverride = null;
        });
      case _DecisionKind.complete:
        _acceptedCodes.add(code);
        setState(() {
          _error = null;
          _completed = true;
          _statusOverride = decision.message;
          if (_previewImage != null) {
            _previewStatus = QrScanPreviewStatus.success;
            _previewMessage = decision.message;
          }
        });
        await Future<void>.delayed(_successHoldDuration);
        if (!mounted) return;
        decision.onShown!();
    }
  }

  /// Galeriden seçilen fotoğrafı anında tarama vizöründe gösterir,
  /// [QrImageDecoder]'in kademeli görüntü iyileştirme hattıyla çözer ve
  /// sonucu kamera yoluyla aynı karar mekanizmasına ([widget.onCode])
  /// iletir.
  Future<void> _pickFromGallery() async {
    if (_busy || _completed) return;

    final XFile? picked =
        await ImagePicker().pickImage(source: ImageSource.gallery);
    if (picked == null || !mounted) return;

    final session = ++_gallerySession;
    bool isCurrent() => mounted && session == _gallerySession;

    setState(() {
      _error = null;
      _previewImage = File(picked.path);
      _previewStatus = QrScanPreviewStatus.scanning;
      _previewMessage = 'Görüntü iyileştiriliyor ve taranıyor…';
    });

    final (code, _) = await (
      _imageDecoder.decodeFile(picked.path),
      Future<void>.delayed(_minimumGalleryScanDuration),
    ).wait;
    if (!isCurrent()) return;

    if (code == null) {
      setState(() {
        _previewStatus = QrScanPreviewStatus.failure;
        _previewMessage = 'Lütfen daha net bir fotoğraf seçin.';
      });
      return;
    }

    setState(() => _previewMessage = 'Kod okundu, doğrulanıyor…');
    _busy = true;
    final decision = await widget.onCode(code, QrScanSource.gallery);
    _busy = false;
    if (!isCurrent()) return;
    await _applyDecision(code, decision);
  }

  /// Önizlemeyi kapatıp canlı kamera moduna döner; devam eden bir galeri
  /// taramasının sonucu oturum sayacı ile geçersiz kılınır.
  void _closePreview() {
    if (_previewImage == null || _completed) return;
    _gallerySession++;
    setState(() => _previewImage = null);
  }

  @override
  Widget build(BuildContext context) {
    final previewImage = _previewImage;
    return PopScope(
      // Önizleme açıkken geri hareketi ekrandan çıkmak yerine kameraya döner.
      canPop: previewImage == null,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _closePreview();
      },
      child: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(controller: _controller, onDetect: _onDetect),
          _CameraOverlay(
            status: (_completed || _flashing)
                ? QrScanPreviewStatus.success
                : QrScanPreviewStatus.scanning,
            message: _statusOverride ?? widget.instruction,
            busy: _busy,
          ),
          if (_error != null)
            Positioned(
              bottom: 96,
              left: 16,
              right: 16,
              child: _ErrorBanner(
                message: _error!,
                onDismiss: () => setState(() => _error = null),
              ),
            ),
          if (previewImage == null && !_completed)
            Positioned(
              bottom: 24,
              left: 0,
              right: 0,
              child: Center(
                child: FloatingActionButton.extended(
                  heroTag: null,
                  onPressed: _busy ? null : _pickFromGallery,
                  icon: const Icon(Icons.photo_library_outlined),
                  label: const Text('Galeriden Seç'),
                ),
              ),
            ),
          if (previewImage != null)
            QrScanPreview(
              image: previewImage,
              status: _previewStatus,
              message: _previewMessage,
              onRetry: _pickFromGallery,
              onClose: _closePreview,
            ),
        ],
      ),
    );
  }
}

/// Canlı kameranın üstüne çizilen katman: vizörün dışını karartan maske,
/// ortada lazerli [ScanViewfinder] ve altında yönerge/durum satırı.
/// Karartma, hemşirenin dikkatini kodun hizalanması gereken alana
/// yönlendirir.
class _CameraOverlay extends StatelessWidget {
  const _CameraOverlay({
    required this.status,
    required this.message,
    required this.busy,
  });

  final QrScanPreviewStatus status;
  final String message;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final frame = (constraints.maxWidth * 0.72).clamp(180.0, 300.0);
        final rect = Rect.fromCenter(
          center:
              Offset(constraints.maxWidth / 2, constraints.maxHeight * 0.42),
          width: frame,
          height: frame,
        );
        return Stack(
          children: [
            Positioned.fill(
              child: IgnorePointer(
                child: CustomPaint(painter: _ScrimPainter(cutout: rect)),
              ),
            ),
            Positioned.fromRect(
              rect: rect,
              child: ScanViewfinder(status: status, dimension: frame),
            ),
            Positioned(
              top: rect.bottom + 24,
              left: 24,
              right: 24,
              child:
                  ScanStatusLine(status: status, message: message, busy: busy),
            ),
          ],
        );
      },
    );
  }
}

/// Vizör bölgesi hariç tüm alanı yarı saydam siyahla kaplar.
class _ScrimPainter extends CustomPainter {
  _ScrimPainter({required this.cutout});

  final Rect cutout;

  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()
      ..fillType = PathFillType.evenOdd
      ..addRect(Offset.zero & size)
      ..addRRect(RRect.fromRectAndRadius(
          cutout, const Radius.circular(ScanViewfinder.cornerRadius)));
    canvas.drawPath(
        path, Paint()..color = Colors.black.withValues(alpha: 0.55));
  }

  @override
  bool shouldRepaint(_ScrimPainter oldDelegate) => oldDelegate.cutout != cutout;
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message, required this.onDismiss});

  final String message;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.red.shade700,
      borderRadius: BorderRadius.circular(12),
      elevation: 4,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 6, 6, 6),
        child: Row(
          children: [
            const Icon(Icons.error_outline_rounded, color: Colors.white),
            const SizedBox(width: 10),
            Expanded(
                child: Text(message,
                    style: const TextStyle(
                        color: Colors.white, fontWeight: FontWeight.w500))),
            TextButton(
              onPressed: onDismiss,
              child: const Text('Tamam',
                  style: TextStyle(
                      color: Colors.white, fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      ),
    );
  }
}
