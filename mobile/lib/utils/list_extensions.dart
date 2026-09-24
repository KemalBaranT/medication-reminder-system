/// Her barkod/QR tarama ekrani tarafindan, her cagri noktasinda manuel bir
/// bos kontrolu yapmadan `BarcodeCapture.barcodes`ten algilanan ilk kodu
/// guvenle okumak icin paylasilir; tek satirlik bir yardimci icin
/// `package:collection`i projeye eklemek yerine kucuk, bagimsiz bir
/// extension olarak tutulur.
extension FirstOrNull<T> on List<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
