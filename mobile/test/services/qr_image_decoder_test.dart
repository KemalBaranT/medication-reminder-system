import 'dart:math';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:ilac_takip_mobile/services/qr_image_decoder.dart';
import 'package:image/image.dart' as img;
import 'package:zxing2/qrcode.dart';

/// Bir bilgisayar ekranindan telefonla cekilmis bileklik QR fotografini
/// taklit eden sentetik goruntu: dusuk kontrast, tek taraftan ekran
/// parlamasi, diyagonal moire bantlari, yatay piksel-satiri izgarasi ve
/// sensor gurultusu. Gercek hasta fotograflari test verisi olarak
/// depoya eklenemeyeceginden algoritma bu kontrollu bozulmalarla dogrulanir.
Uint8List _screenPhotoOf(String payload, {bool darkMode = false}) {
  final matrix = Encoder.encode(payload, ErrorCorrectionLevel.m).matrix!;
  const module = 14, quiet = 4, canvasW = 1600, canvasH = 1400;
  final qrPx = (matrix.width + quiet * 2) * module;
  final ox = (canvasW - qrPx) ~/ 2, oy = (canvasH - qrPx) ~/ 2;
  final rnd = Random(42);
  final image = img.Image(width: canvasW, height: canvasH);

  for (var y = 0; y < canvasH; y++) {
    for (var x = 0; x < canvasW; x++) {
      final mx = (x - ox) ~/ module - quiet, my = (y - oy) ~/ module - quiet;
      final dark = mx >= 0 &&
          my >= 0 &&
          mx < matrix.width &&
          my < matrix.height &&
          matrix.get(mx, my) == 1;
      var v = (dark != darkMode) ? 95.0 : 165.0;
      v += 55 * x / canvasW; // parlama gradyani
      v += 38 * sin((x + y) * 2 * pi / 5.3); // diyagonal moire
      if (y % 3 == 0) v -= 30; // ekran satir izgarasi
      v += rnd.nextInt(31) - 15; // gurultu
      final c = v.clamp(0, 255).toInt();
      image.setPixelRgb(x, y, c, (c * 0.95).toInt(), c);
    }
  }
  return img.encodeJpg(image, quality: 80);
}

/// On isleme olmadan, tek bir HybridBinarizer ile dogrudan cozme denemesi:
/// iyilestirme hattinin sagladigi farki gostermek icin referans.
String? _naiveDecode(Uint8List bytes) {
  final image = img.decodeImage(bytes)!;
  final source = RGBLuminanceSource(
      image.width,
      image.height,
      image
          .convert(numChannels: 4)
          .getBytes(order: img.ChannelOrder.abgr)
          .buffer
          .asInt32List());
  try {
    return QRCodeReader().decode(BinaryBitmap(HybridBinarizer(source))).text;
  } catch (_) {
    return null;
  }
}

void main() {
  test('moire ve parlama iceren ekran fotografindaki QR cozulur', () {
    final photo = _screenPhotoOf('BLK-2026-000123');
    expect(_naiveDecode(photo), isNull,
        reason: 'Senaryo, on islemesiz okumanin basarisiz oldugu kadar '
            'zorlu olmalidir; aksi halde test hicbir sey kanitlamaz.');
    expect(decodeWithEnhancement(photo), 'BLK-2026-000123');
  });

  test('koyu tema ekranindaki ters renkli QR cozulur', () {
    final photo = _screenPhotoOf('BLK-2026-000456', darkMode: true);
    expect(decodeWithEnhancement(photo), 'BLK-2026-000456');
  });

  test('QR icermeyen veya bozuk dosya null dondurur, istisna firlatmaz', () {
    final blank = img.encodePng(img.Image(width: 400, height: 300));
    expect(decodeWithEnhancement(blank), isNull);
    expect(decodeWithEnhancement(Uint8List.fromList([1, 2, 3])), isNull);
  });
}
