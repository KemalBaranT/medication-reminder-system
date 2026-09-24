import 'package:flutter_test/flutter_test.dart';
import 'package:ilac_takip_mobile/models/dose_target.dart';

void main() {
  test('manuel kayıt barkod doğrulamalı sayılmaz', () {
    expect(DoseVerification.manual.isManual, isTrue);
    expect(DoseVerification.manual.isBarcodeVerified, isFalse);
  });

  test('bileklik ve ilaç kamerayla okunduysa barkod doğrulamalı sayılır', () {
    const v = DoseVerification(
        patientScanned: true, medicationScanned: true, usedGallery: false);
    expect(v.isBarcodeVerified, isTrue);
  });

  test('galeriden okunan kod yatak başı doğrulaması sayılmaz', () {
    const v = DoseVerification(
        patientScanned: true, medicationScanned: true, usedGallery: true);
    expect(v.isBarcodeVerified, isFalse);
  });

  test('yalnızca bileklik okunduysa barkod doğrulamalı sayılmaz', () {
    const v = DoseVerification(
        patientScanned: true, medicationScanned: false, usedGallery: false);
    expect(v.isManual, isFalse);
    expect(v.isBarcodeVerified, isFalse);
  });
}
