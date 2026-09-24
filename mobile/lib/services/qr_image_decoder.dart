import 'dart:io';
import 'dart:isolate';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as img;
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:zxing2/qrcode.dart';

import '../utils/list_extensions.dart';

/// Galeriden secilen statik bir fotograftaki QR kodu, canli kameraya gore
/// cok daha zorlu kosullarda cozmek icin tasarlanmis cok asamali okuyucu.
///
/// **Neden gerekli:** Sahada paylasilan bileklik fotograflarinin buyuk kismi
/// bir bilgisayar/telefon ekraninin kameraya cekilmis halidir. Bu goruntulerde
/// ekranin piksel izgarasi ile kamera sensorunun izgarasi girisim yaparak
/// *moire* desenleri (diyagonal cizgiler, renkli dalgalanmalar) olusturur;
/// ustune ekran parlamasi ve dusuk kontrast eklenir. Platformun yerel QR
/// motoru (Android'de ML Kit, iOS'ta Vision) bu gurultuyu QR modullerinden
/// ayiramadigi icin kod okunamaz.
///
/// **Mimari - kademeli (cascading) strateji:** Her asama bir oncekinden daha
/// pahalidir ve yalnizca oncekiler basarisiz olursa calisir; boylece net bir
/// fotograf hala milisaniyeler icinde okunurken, yalnizca zor goruntuler
/// tam islem maliyetini oder:
///
/// 1. **Yerel motor, ham goruntu** - en hizli yol; temiz fotograflarin cogu
///    burada cozulur.
/// 2. **Arka plan isolate'inde on isleme + ZXing** - goruntu birden fazla
///    olcekte gri tonlamaya cevrilir, moire bulaniklastirmayla bastirilir,
///    kontrast gerilir ve hem global (Otsu) hem yerel (adaptif) esikleme ile
///    siyah-beyaza indirgenir. Her varyant saf Dart ZXing okuyucusuna
///    `tryHarder` modunda, hem normal hem ters (koyu tema ekranlari icin)
///    polaritede verilir. Isolate kullanimi, 12 MP'lik bir fotografin piksel
///    piksel islenmesinin UI thread'ini (ve tarama animasyonunu) dondurmasini
///    engeller.
/// 3. **Yerel motor, iyilestirilmis varyantlar** - ZXing'in de basaramadigi
///    durumda, ayni on islenmis varyantlar gecici PNG dosyalari olarak yerel
///    motora son bir kez sunulur; iki farkli dedektorun hata profilleri
///    farkli oldugundan bu kombinasyon tek basina ikisinden de daha yuksek
///    okuma orani saglar.
class QrImageDecoder {
  /// Yerel motora erisim, ekranin canli kamera icin zaten olusturdugu
  /// denetleyici uzerinden saglanir; ikinci bir kamera oturumu acilmaz.
  QrImageDecoder(this._scanner);

  final MobileScannerController _scanner;

  /// [imagePath] konumundaki fotograftaki QR kodunun ham degerini dondurur;
  /// tum asamalar basarisiz olursa `null` dondurur. Hicbir asama istisna
  /// firlatmaz - bozuk veya desteklenmeyen bir dosya da "okunamadi" olarak
  /// raporlanir, cunku cagiran taraf icin iki durumun kullaniciya yansimasi
  /// aynidir: daha net bir fotograf secilmelidir.
  Future<String?> decodeFile(String imagePath) async {
    final direct = await _analyzeNative(imagePath);
    if (direct != null) return direct;

    final Uint8List bytes;
    try {
      bytes = await File(imagePath).readAsBytes();
    } on FileSystemException {
      return null;
    }

    final _EnhanceOutcome outcome;
    try {
      outcome = await Isolate.run(() => _enhanceAndDecode(bytes));
    } catch (_) {
      // Ornegin cok buyuk bir goruntude bellek yetersizligi: hat sessizce
      // "okunamadi" sonucuna duser, uygulama cokmez.
      return null;
    }
    if (outcome.code != null) return outcome.code;

    return _analyzeNativeVariants(outcome.fallbackPngs);
  }

  /// Yerel motoru tek bir dosya uzerinde calistirir. Eklenti, bazi
  /// platformlarda "bulunamadi" durumunu `null` yerine istisna olarak
  /// bildirdiginden her iki sonuc da ayni sekilde ele alinir.
  Future<String?> _analyzeNative(String path) async {
    try {
      final capture = await _scanner.analyzeImage(path);
      return capture?.barcodes.firstOrNull?.rawValue;
    } catch (_) {
      return null;
    }
  }

  /// On islenmis varyantlari gecici dizine yazip sirayla yerel motora sunar.
  /// Dosyalar, hasta bilgisi iceren goruntulerin cihazda iz birakmamasi icin
  /// sonuc ne olursa olsun silinir.
  Future<String?> _analyzeNativeVariants(List<Uint8List> pngs) async {
    if (pngs.isEmpty) return null;
    final dir = await getTemporaryDirectory();
    final stamp = DateTime.now().microsecondsSinceEpoch;
    final files = <File>[];
    try {
      for (var i = 0; i < pngs.length; i++) {
        final file = File(p.join(dir.path, 'qr_enhanced_${stamp}_$i.png'));
        await file.writeAsBytes(pngs[i], flush: true);
        files.add(file);
        final code = await _analyzeNative(file.path);
        if (code != null) return code;
      }
      return null;
    } finally {
      for (final file in files) {
        try {
          await file.delete();
        } on FileSystemException {
          // Isletim sistemi gecici dizini zaten periyodik olarak temizler.
        }
      }
    }
  }
}

/// On isleme + ZXing hattini yerel motor olmadan, senkron olarak calistirir.
/// Yerel motor (ML Kit/Vision) birim testlerinde bulunmadigindan, goruntu
/// iyilestirme algoritmasinin moire'li ekran fotograflarindaki basarisi bu
/// giris noktasi uzerinden dogrulanir.
@visibleForTesting
String? decodeWithEnhancement(Uint8List imageBytes) =>
    _enhanceAndDecode(imageBytes).code;

/// Isolate'ten ana thread'e donen sonuc: ya ZXing'in cozdugu kod ya da
/// yerel motorun deneyecegi, PNG olarak kodlanmis en umut verici varyantlar.
typedef _EnhanceOutcome = ({String? code, List<Uint8List> fallbackPngs});

/// Tek kanalli (luminans) 8 bitlik goruntu. On isleme adimlari, `image`
/// paketinin genel amacli RGBA modeli yerine dogrudan bu duz dizi uzerinde
/// calisir; bu hem bellek kullanimini dortte birine indirir hem de
/// integral-goruntu tabanli filtrelerin O(1) pencere hesaplamasina izin verir.
class _Gray {
  _Gray(this.width, this.height, this.pixels);

  final int width;
  final int height;
  final Uint8List pixels;
}

/// Ekran goruntusu kaynakli moire'nin frekansi, fotografin cekildigi mesafeye
/// ve cozunurluge gore degisir; tek bir olcekte bastirilamayan girisim
/// deseni, farkli bir olcege kucultulurken ortalama alma ile kendiliginden
/// kaybolabilir. Bu nedenle ayni goruntu birkac uzun-kenar boyutunda denenir.
/// En buyuk deger, QR modullerini korumak ile isleme suresini sinirlamak
/// arasindaki dengedir.
const _targetLongEdges = [1200, 800, 500];

/// Isolate icinde calisan on isleme + ZXing hatti. Ust duzey bir fonksiyon
/// olarak tanimlanmistir; boylece isolate'e yalnizca ham bayt dizisi
/// kopyalanir, ekran durumu tasinmaz.
_EnhanceOutcome _enhanceAndDecode(Uint8List bytes) {
  // `image` paketi, taninmayan veya kesik dosyalarda `null` dondurmek yerine
  // bicim tespiti sirasinda RangeError firlatabilir; her iki durum da
  // "okunamadi" anlamina gelir.
  img.Image? decoded;
  try {
    decoded = img.decodeImage(bytes);
  } catch (_) {
    decoded = null;
  }
  if (decoded == null) return (code: null, fallbackPngs: const []);

  // Telefon kameralari yonu EXIF etiketiyle bildirir; ZXing yonu dikkate
  // almaz ama duzeltilmemis bir goruntu ayni kodu farkli olceklerde
  // tutarsiz sekilde bozabilir.
  final oriented = img.bakeOrientation(decoded);
  final longEdge =
      oriented.width > oriented.height ? oriented.width : oriented.height;

  final fallback = <_Gray>[];
  // Buyukten kucuge: en fazla detayi koruyan olcek once denenir.
  final scales = <int>{
    for (final edge in _targetLongEdges)
      if (edge < longEdge) edge,
    if (longEdge <= _targetLongEdges.first) longEdge,
  }.toList()
    ..sort((a, b) => b.compareTo(a));

  for (final edge in scales) {
    final gray = _toGray(_resizeLongEdge(oriented, edge));

    // Varyantlar, en ucuz/en az bozucu olandan en agresif olana dogru
    // siralanmistir: net goruntuler ilk denemede cozulur.
    final stretched = _contrastStretch(gray);
    final smoothed = _contrastStretch(_boxBlur(gray, _blurRadiusFor(edge)));
    final otsu = _otsuBinarize(smoothed);
    final adaptive = _adaptiveBinarize(smoothed);

    for (final (variant, continuousTone) in [
      (stretched, true),
      (smoothed, true),
      (adaptive, false),
      (otsu, false),
    ]) {
      final code = _zxingDecode(variant, continuousTone: continuousTone);
      if (code != null) return (code: code, fallbackPngs: const []);
    }

    if (edge == scales.first) fallback.addAll([smoothed, adaptive, otsu]);
    if (edge != scales.first && fallback.length < 4) fallback.add(adaptive);
  }

  return (
    code: null,
    fallbackPngs: [for (final g in fallback) _encodePng(g)],
  );
}

/// Kucultme, `average` enterpolasyonuyla yapilir: her hedef piksel kaynak
/// bolgenin ortalamasidir. Bu, en-yakin-komsu yontemine gore ekran piksel
/// izgarasini ve moire'yi dogal olarak bastiran bir alcak-geciren filtredir.
img.Image _resizeLongEdge(img.Image src, int longEdge) {
  final current = src.width > src.height ? src.width : src.height;
  if (current == longEdge) return src;
  return src.width >= src.height
      ? img.copyResize(src,
          width: longEdge, interpolation: img.Interpolation.average)
      : img.copyResize(src,
          height: longEdge, interpolation: img.Interpolation.average);
}

/// ITU-R BT.601 agirliklariyla luminansa donusum. Renk bilgisi QR icin
/// anlamsizdir ve ekran fotograflarindaki renkli moire bantlari tek kanala
/// indirgendiginde buyuk olcude birbirini notrler.
_Gray _toGray(img.Image src) {
  final out = Uint8List(src.width * src.height);
  var i = 0;
  for (final px in src) {
    out[i++] = ((px.r * 299 + px.g * 587 + px.b * 114) ~/ 1000).clamp(0, 255);
  }
  return _Gray(src.width, src.height, out);
}

/// Bulaniklastirma yaricapi olcekle orantilidir: buyuk olcekte moire
/// cizgileri birkac piksel genisligindedir, kucuk olcekte ise ortalama alma
/// isin cogunu zaten yapmistir ve fazla bulanıklik QR modullerini eritir.
int _blurRadiusFor(int longEdge) => longEdge >= 1000 ? 2 : 1;

/// Satir/sutun toplamlarinin onceden hesaplandigi (summed-area table)
/// integral goruntu. Hem kutu bulaniklastirma hem adaptif esikleme icin
/// herhangi bir pencerenin ortalamasini pencere boyutundan bagimsiz sabit
/// surede verir. En buyuk olcekte (1200x1200x255) toplam 32 bit sinirinin
/// altinda kalir.
Uint32List _integral(_Gray g) {
  final w = g.width + 1;
  final sums = Uint32List(w * (g.height + 1));
  for (var y = 0; y < g.height; y++) {
    var rowSum = 0;
    for (var x = 0; x < g.width; x++) {
      rowSum += g.pixels[y * g.width + x];
      sums[(y + 1) * w + x + 1] = sums[y * w + x + 1] + rowSum;
    }
  }
  return sums;
}

/// Integral goruntu uzerinden, kenarlarda kirpilmis bir pencerenin
/// ortalamasini hesaplamak icin her piksele uygulanan ortak cekirdek.
Uint8List _windowMeans(_Gray g, int radius) {
  final sums = _integral(g);
  final w = g.width + 1;
  final out = Uint8List(g.pixels.length);
  for (var y = 0; y < g.height; y++) {
    final y0 = y - radius < 0 ? 0 : y - radius;
    final y1 = y + radius + 1 > g.height ? g.height : y + radius + 1;
    for (var x = 0; x < g.width; x++) {
      final x0 = x - radius < 0 ? 0 : x - radius;
      final x1 = x + radius + 1 > g.width ? g.width : x + radius + 1;
      final total = sums[y1 * w + x1] -
          sums[y0 * w + x1] -
          sums[y1 * w + x0] +
          sums[y0 * w + x0];
      out[y * g.width + x] = total ~/ ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

/// Moire ve sensor gurultusu gibi yuksek frekansli desenleri, QR
/// modullerinin kenarlarini tamamen yok etmeden bastiran kutu filtresi.
_Gray _boxBlur(_Gray g, int radius) =>
    _Gray(g.width, g.height, _windowMeans(g, radius));

/// Histogramin alt ve ust %1'lik uclarini kirparak kalan araligi 0-255'e
/// yayar. Ekran parlamasi ve soluk arka isik nedeniyle gri-uzerine-gri
/// gorunen bir QR'i, uc degerlerdeki tekil parlama piksellerinden
/// etkilenmeden yeniden siyah-beyaz karakterine kavusturur.
_Gray _contrastStretch(_Gray g) {
  final histogram = List<int>.filled(256, 0);
  for (final v in g.pixels) {
    histogram[v]++;
  }
  final clip = g.pixels.length ~/ 100;
  var lo = 0, acc = 0;
  while (lo < 255 && (acc += histogram[lo]) <= clip) {
    lo++;
  }
  var hi = 255;
  acc = 0;
  while (hi > 0 && (acc += histogram[hi]) <= clip) {
    hi--;
  }
  if (hi - lo < 16) return g;

  final lut = Uint8List(256);
  for (var v = 0; v < 256; v++) {
    lut[v] = (((v - lo) * 255) ~/ (hi - lo)).clamp(0, 255);
  }
  final out = Uint8List(g.pixels.length);
  for (var i = 0; i < out.length; i++) {
    out[i] = lut[g.pixels[i]];
  }
  return _Gray(g.width, g.height, out);
}

/// Otsu yontemiyle tek bir global esik secer (siniflar arasi varyansi
/// maksimize eden deger). Aydinlatmasi homojen goruntulerde en temiz
/// siyah-beyaz ciktiyi verir; parlama iceren goruntuler icin
/// [_adaptiveBinarize] tamamlayici olarak kullanilir.
_Gray _otsuBinarize(_Gray g) {
  final histogram = List<int>.filled(256, 0);
  for (final v in g.pixels) {
    histogram[v]++;
  }
  final total = g.pixels.length;
  var sumAll = 0.0;
  for (var t = 0; t < 256; t++) {
    sumAll += t * histogram[t];
  }

  var sumBackground = 0.0, weightBackground = 0, bestVariance = -1.0;
  var threshold = 127;
  for (var t = 0; t < 256; t++) {
    weightBackground += histogram[t];
    if (weightBackground == 0) continue;
    final weightForeground = total - weightBackground;
    if (weightForeground == 0) break;
    sumBackground += t * histogram[t];
    final meanB = sumBackground / weightBackground;
    final meanF = (sumAll - sumBackground) / weightForeground;
    final variance =
        weightBackground * weightForeground * (meanB - meanF) * (meanB - meanF);
    if (variance > bestVariance) {
      bestVariance = variance;
      threshold = t;
    }
  }

  final out = Uint8List(total);
  for (var i = 0; i < total; i++) {
    out[i] = g.pixels[i] > threshold ? 255 : 0;
  }
  return _Gray(g.width, g.height, out);
}

/// Her pikseli kendi komsulugunun ortalamasiyla karsilastiran yerel
/// esikleme. Ekranin bir kosesindeki parlama veya vinyetleme, global bir
/// esigin QR'in yarisini beyaza boyamasina yol acarken, bu yontem her
/// bolgeyi kendi aydinlatmasina gore degerlendirir. Pencere, birkac QR
/// modulunu kapsayacak kadar genis secilir; sabit ofset ise duz beyaz
/// alanlardaki gurultunun siyah benek olarak belirmesini onler.
_Gray _adaptiveBinarize(_Gray g) {
  final shortEdge = g.width < g.height ? g.width : g.height;
  final radius = (shortEdge ~/ 24).clamp(7, 40);
  const offset = 8;
  final means = _windowMeans(g, radius);
  final out = Uint8List(g.pixels.length);
  for (var i = 0; i < out.length; i++) {
    out[i] = g.pixels[i] + offset < means[i] ? 0 : 255;
  }
  return _Gray(g.width, g.height, out);
}

/// Bir varyanti saf Dart ZXing okuyucusuyla, `tryHarder` modunda ve hem
/// normal hem ters polaritede dener. Surekli tonlu varyantlar ayrica
/// global histogram binarizer'i ile de denenir; zaten ikili olan
/// varyantlarda bu tekrar sonuc degistirmeyecegi icin atlanir.
String? _zxingDecode(_Gray g, {required bool continuousTone}) {
  final argb = Int32List(g.pixels.length);
  for (var i = 0; i < argb.length; i++) {
    final v = g.pixels[i];
    argb[i] = 0xFF000000 | (v << 16) | (v << 8) | v;
  }
  final source = RGBLuminanceSource(g.width, g.height, argb);
  final inverted = InvertedLuminanceSource(source);
  final hints = DecodeHints()..put(DecodeHintType.tryHarder);

  final bitmaps = [
    BinaryBitmap(HybridBinarizer(source)),
    BinaryBitmap(HybridBinarizer(inverted)),
    if (continuousTone) BinaryBitmap(GlobalHistogramBinarizer(source)),
  ];
  for (final bitmap in bitmaps) {
    try {
      return QRCodeReader().decode(bitmap, hints: hints).text;
    } on ReaderException {
      continue;
    } catch (_) {
      // Portlanmis kutuphane, bozuk girdilerde ReaderException disinda
      // RangeError gibi hatalar da firlatabilir; bu yalnizca "bu varyant
      // okunamadi" anlamina gelir ve hattin geri kalanini durdurmamalidir.
      continue;
    }
  }
  return null;
}

/// Yerel motora sunulacak varyanti kayipsiz PNG olarak kodlar; JPEG'in
/// blok artefaktlari esiklenmis keskin kenarlari yeniden bozacagi icin
/// tercih edilmez.
Uint8List _encodePng(_Gray g) => img.encodePng(img.Image.fromBytes(
      width: g.width,
      height: g.height,
      bytes: g.pixels.buffer,
      numChannels: 1,
    ));
