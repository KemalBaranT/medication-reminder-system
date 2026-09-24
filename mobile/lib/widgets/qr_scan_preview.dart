import 'dart:io';

import 'package:flutter/material.dart';

/// [ScanViewfinder] ve [QrScanPreview]'in gorsel durumu. Durumlar, arka
/// plandaki cozumleme hattinin asamalarina degil, kullanicinin algilamasi
/// gereken sonuca karsilik gelir: "calisiyor", "basarili", "basarisiz".
enum QrScanPreviewStatus { scanning, success, failure }

/// Uygulamadaki tum QR tarama deneyimlerinin ortak gorsel dili: kose
/// isaretli kare vizor, tarama sirasinda yukaridan asagiya hareket eden
/// kirmizi "lazer" cizgisi ve basari aninda yesil nabiz parlamasi.
///
/// Hem canli kamera katmaninda (ici saydam, kamera goruntusu arkadan
/// gorunur) hem de galeriden secilen fotografin onizlemesinde ([child] ile
/// fotograf verilir) ayni widget kullanilir; boylece hemsire hangi ekrandan
/// ve hangi kaynaktan tararsa tarasin ayni geribildirimi gorur.
///
/// Renk dili kasitli olarak ikilidir: tarama sirasinda kirmizi (klasik
/// barkod lazeri), basari aninda yesil. Basarisizlikta hareket durur ve
/// kose isaretleri kehribar rengine doner.
class ScanViewfinder extends StatefulWidget {
  const ScanViewfinder({
    super.key,
    required this.status,
    required this.dimension,
    this.child,
  });

  final QrScanPreviewStatus status;

  /// Vizorun kenar uzunlugu. Cagiran taraf, cevresine cizecegi karartma
  /// maskesinin bosluguyla hizalanabilmesi icin boyutu kendisi belirler.
  final double dimension;

  /// Vizorun icinde gosterilecek icerik (ornegin secilen fotograf). `null`
  /// ise vizorun ici saydamdir ve arkadaki canli kamera goruntusu gorunur.
  final Widget? child;

  static const scanColor = Color(0xFFFF1744);
  static const successColor = Color(0xFF00E676);
  static const failureColor = Color(0xFFFFB300);

  /// Vizor, karartma maskesi ve iceriginin paylastigi kose yaricapi.
  static const cornerRadius = 18.0;

  @override
  State<ScanViewfinder> createState() => _ScanViewfinderState();
}

class _ScanViewfinderState extends State<ScanViewfinder>
    with TickerProviderStateMixin {
  /// Lazer cizgisinin vizorun ustunden altina ve geri gidis hareketini surer.
  late final AnimationController _sweep = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1600),
  );

  /// Basari anindaki yesil "nabiz" parlamasini surer.
  late final AnimationController _glow = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 550),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _syncAnimations();
  }

  @override
  void didUpdateWidget(covariant ScanViewfinder oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.status != widget.status) _syncAnimations();
  }

  @override
  void dispose() {
    _sweep.dispose();
    _glow.dispose();
    super.dispose();
  }

  /// Animasyon denetleyicilerini gorsel duruma esitler. Isletim sisteminde
  /// "animasyonlari azalt" erisilebilirlik ayari aciksa hareket tamamen
  /// kapatilir; cizgi vizorun ortasinda sabit kalir ve durum yalnizca renk
  /// ve metinle iletilir.
  void _syncAnimations() {
    final reduceMotion = MediaQuery.of(context).disableAnimations;
    switch (widget.status) {
      case QrScanPreviewStatus.scanning:
        _glow.stop();
        _glow.value = 0;
        if (reduceMotion) {
          _sweep.stop();
          _sweep.value = 0.5;
        } else if (!_sweep.isAnimating) {
          _sweep.repeat(reverse: true);
        }
      case QrScanPreviewStatus.success:
        _sweep.stop();
        if (reduceMotion) {
          _glow.value = 1;
        } else {
          _glow.repeat(reverse: true);
        }
      case QrScanPreviewStatus.failure:
        _sweep.stop();
        _glow.stop();
        _glow.value = 0;
    }
  }

  Color get _accent => switch (widget.status) {
        QrScanPreviewStatus.scanning => ScanViewfinder.scanColor,
        QrScanPreviewStatus.success => ScanViewfinder.successColor,
        QrScanPreviewStatus.failure => ScanViewfinder.failureColor,
      };

  /// Tum katmanlar tek bir [AnimatedBuilder] altinda cizilir; boylece her
  /// karede yalnizca vizor yeniden olusturulur, ekranin geri kalani degil.
  @override
  Widget build(BuildContext context) {
    const radius =
        BorderRadius.all(Radius.circular(ScanViewfinder.cornerRadius));
    final child = widget.child;
    return SizedBox.square(
      dimension: widget.dimension,
      child: AnimatedBuilder(
        animation: Listenable.merge([_sweep, _glow]),
        builder: (context, _) {
          final glow = _glow.value;
          return Stack(
            fit: StackFit.expand,
            children: [
              if (child != null)
                DecoratedBox(
                  decoration: BoxDecoration(
                    borderRadius: radius,
                    boxShadow: [
                      BoxShadow(
                        color: _accent.withValues(alpha: 0.25 + 0.45 * glow),
                        blurRadius: 18 + 26 * glow,
                        spreadRadius: 1 + 5 * glow,
                      ),
                    ],
                  ),
                  child: ClipRRect(borderRadius: radius, child: child),
                ),
              if (widget.status == QrScanPreviewStatus.success)
                ClipRRect(
                  borderRadius: radius,
                  child: ColoredBox(
                    color: ScanViewfinder.successColor
                        .withValues(alpha: 0.10 + 0.18 * glow),
                  ),
                ),
              if (widget.status == QrScanPreviewStatus.scanning)
                _buildLaser(widget.dimension),
              CustomPaint(
                painter: _ViewfinderCornersPainter(color: _accent),
              ),
              if (widget.status == QrScanPreviewStatus.success)
                Center(
                  child: Transform.scale(
                    scale: 1 + 0.08 * glow,
                    child: Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: ScanViewfinder.successColor,
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: ScanViewfinder.successColor
                                .withValues(alpha: 0.7),
                            blurRadius: 24,
                          ),
                        ],
                      ),
                      child: const Icon(Icons.check_rounded,
                          color: Colors.black, size: 40),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  /// Parlak cekirdek cizgi ile onun hareket yonunun arkasinda kalan, gittikce
  /// solan bir "iz" bandindan olusan lazer. Iz, cizgi asagi inerken ustte,
  /// yukari cikarken altta cizilir; bu, hareket yonunu hissettiren ve
  /// efekti duz bir cizgiden ayiran ayrintidir.
  Widget _buildLaser(double frameSize) {
    const color = ScanViewfinder.scanColor;
    const inset = 14.0;
    const trailHeight = 56.0;
    final travel = frameSize - inset * 2;
    final lineY = inset + travel * Curves.easeInOut.transform(_sweep.value);
    final movingDown = _sweep.status != AnimationStatus.reverse;

    return IgnorePointer(
      child: Stack(
        children: [
          Positioned(
            left: inset,
            right: inset,
            top: movingDown ? lineY - trailHeight : lineY,
            height: trailHeight,
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin:
                      movingDown ? Alignment.topCenter : Alignment.bottomCenter,
                  end:
                      movingDown ? Alignment.bottomCenter : Alignment.topCenter,
                  colors: [
                    color.withValues(alpha: 0),
                    color.withValues(alpha: 0.28),
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            left: inset,
            right: inset,
            top: lineY - 1.5,
            height: 3,
            child: DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(2),
                gradient: LinearGradient(
                  colors: [
                    color.withValues(alpha: 0),
                    color,
                    Colors.white,
                    color,
                    color.withValues(alpha: 0),
                  ],
                  stops: const [0, 0.2, 0.5, 0.8, 1],
                ),
                boxShadow: [
                  BoxShadow(
                    color: color.withValues(alpha: 0.9),
                    blurRadius: 12,
                    spreadRadius: 1.5,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Galeriden secilen fotografi bir [ScanViewfinder] icinde gosteren ve
/// cozumleme suresince lazer taramasini oynatan tam ekran katman.
///
/// **Neden var:** Galeriden okuma, on isleme nedeniyle zor goruntulerde
/// birkac saniye surebilir. Bu sure boyunca yalnizca bir donen gosterge
/// sunmak, kullaniciya hangi fotografin islendigini ve sistemin gercekten
/// calistigini gostermez; kullanici ayni fotografi tekrar tekrar secer.
/// Secilen goruntunun vizor icinde gorunmesi ve tarama cizgisi, canli
/// kameradaki deneyimle ayni zihinsel modeli kurar ve beklemeyi anlamli
/// kilar.
///
/// Widget yalnizca sunumdan sorumludur; cozumleme ve sonraki is akisi
/// kararlari [AdvancedQrScanner]'da ve onu kullanan ekranda kalir.
class QrScanPreview extends StatelessWidget {
  const QrScanPreview({
    super.key,
    required this.image,
    required this.status,
    required this.message,
    required this.onRetry,
    required this.onClose,
  });

  /// Vizor icinde gosterilecek, kullanicinin sectigi orijinal fotograf.
  /// Kullaniciya on islenmis (siyah-beyaz) varyant degil, kendi sectigi
  /// goruntu gosterilir; boylece dogru fotografi sectigini teyit edebilir.
  final File image;

  final QrScanPreviewStatus status;

  /// Vizorun altinda gosterilen, o anki asamayi veya sonucu aciklayan metin.
  final String message;

  /// Basarisizlik durumunda "Baska Fotograf Sec" eylemi.
  final VoidCallback onRetry;

  /// Katmani kapatip canli kameraya donme eylemi.
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final frameSize = (size.width * 0.8).clamp(200.0, 340.0);

    return ColoredBox(
      color: Colors.black.withValues(alpha: 0.88),
      child: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Semantics(
                  label: 'Seçilen fotoğraf taranıyor',
                  image: true,
                  child: ScanViewfinder(
                    status: status,
                    dimension: frameSize,
                    child: ColoredBox(
                      color: Colors.black,
                      child: Image.file(
                        image,
                        fit: BoxFit.contain,
                        gaplessPlayback: true,
                        errorBuilder: (_, __, ___) => const Icon(
                            Icons.broken_image_outlined,
                            color: Colors.white54,
                            size: 48),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 28),
                ScanStatusLine(status: status, message: message),
                if (status == QrScanPreviewStatus.failure) ...[
                  const SizedBox(height: 20),
                  Wrap(
                    alignment: WrapAlignment.center,
                    spacing: 12,
                    runSpacing: 8,
                    children: [
                      FilledButton.icon(
                        onPressed: onRetry,
                        icon: const Icon(Icons.photo_library_outlined),
                        label: const Text('Başka Fotoğraf Seç'),
                      ),
                      OutlinedButton(
                        onPressed: onClose,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.white,
                          side: const BorderSide(color: Colors.white54),
                        ),
                        child: const Text('Kameraya Dön'),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Vizorun altindaki durum satiri; tarama sirasinda kucuk bir ilerleme
/// gostergesi, sonuc durumlarinda ise ilgili ikon yer alir. Metin bir canli
/// bolge olarak isaretlenir ki ekran okuyucular durum degisikligini
/// duyursun. Kamera katmani ve galeri onizlemesi ayni satiri kullanir.
class ScanStatusLine extends StatelessWidget {
  const ScanStatusLine({
    super.key,
    required this.status,
    required this.message,
    this.busy = true,
  });

  final QrScanPreviewStatus status;
  final String message;

  /// Tarama durumunda ilerleme gostergesinin cizilip cizilmeyecegi. Canli
  /// kamerada kod beklenirken sistem "mesgul" degildir; gosterge yalnizca
  /// bir kod islenirken anlamlidir.
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final Widget? leading = switch (status) {
      QrScanPreviewStatus.scanning => busy
          ? const SizedBox.square(
              dimension: 16,
              child: CircularProgressIndicator(
                  strokeWidth: 2, color: ScanViewfinder.scanColor),
            )
          : null,
      QrScanPreviewStatus.success => const Icon(Icons.verified_rounded,
          color: ScanViewfinder.successColor, size: 20),
      QrScanPreviewStatus.failure => const Icon(Icons.error_outline_rounded,
          color: ScanViewfinder.failureColor, size: 20),
    };

    return Semantics(
      liveRegion: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (leading != null) ...[leading, const SizedBox(width: 10)],
          Flexible(
            child: Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 15,
                fontWeight: FontWeight.w600,
                shadows: [Shadow(color: Colors.black54, blurRadius: 6)],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Vizorun dort kosesine, kamera tarayicilarindan tanidik "L" seklindeki
/// isaretleri cizer. Tam bir cerceve yerine yalnizca koselerin cizilmesi,
/// fotografin veya kamera goruntusunun kenarlarini kapatmadan tarama
/// alanini tanimlar.
class _ViewfinderCornersPainter extends CustomPainter {
  _ViewfinderCornersPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    const length = 34.0;
    const radius = ScanViewfinder.cornerRadius;
    final paint = Paint()
      ..color = color
      ..strokeWidth = 4
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final w = size.width, h = size.height;
    final corners = [
      Path()
        ..moveTo(0, length)
        ..lineTo(0, radius)
        ..arcToPoint(const Offset(radius, 0),
            radius: const Radius.circular(radius))
        ..lineTo(length, 0),
      Path()
        ..moveTo(w - length, 0)
        ..lineTo(w - radius, 0)
        ..arcToPoint(Offset(w, radius), radius: const Radius.circular(radius))
        ..lineTo(w, length),
      Path()
        ..moveTo(w, h - length)
        ..lineTo(w, h - radius)
        ..arcToPoint(Offset(w - radius, h),
            radius: const Radius.circular(radius))
        ..lineTo(w - length, h),
      Path()
        ..moveTo(length, h)
        ..lineTo(radius, h)
        ..arcToPoint(Offset(0, h - radius),
            radius: const Radius.circular(radius))
        ..lineTo(0, h - length),
    ];
    for (final corner in corners) {
      canvas.drawPath(corner, paint);
    }
  }

  @override
  bool shouldRepaint(_ViewfinderCornersPainter oldDelegate) =>
      oldDelegate.color != color;
}
