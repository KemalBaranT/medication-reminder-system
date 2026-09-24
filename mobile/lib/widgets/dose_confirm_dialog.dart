import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/dose_target.dart';

/// "İlaç Onayı" penceresini gösterir; hemşire "Onayla"ya basarsa `true`,
/// "İptal"e basarsa veya pencereyi kapatırsa `false` döner.
Future<bool> showDoseConfirmDialog(
  BuildContext context, {
  required DoseTarget target,
  required DoseVerification verification,
}) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (_) =>
        DoseConfirmDialog(target: target, verification: verification),
  );
  return confirmed ?? false;
}

/// Bir dozu "Verildi" olarak kaydetmeden önceki tek güvenlik sorusu.
///
/// Pencere kasıtlı olarak sade tutulur: tek soru, iki düğme. Hangi ilacın,
/// hangi hastaya, hangi saatle kaydedileceği sorunun altında tek satırda
/// gösterilir ki yanlış karta yapılmış bir kaydırma ilk bakışta fark
/// edilsin. Doktorun hemşireye uygulama notu varsa (örneğin "Tok karnına
/// verilsin") uygulamadan önceki son adım olduğu için burada da gösterilir.
/// QR ile doğrulanmış dozlarda doğrulamanın sonucu da aynı yerde
/// belirtilir; galeriden okunan kodlar "barkod doğrulamalı" sayılmadığı
/// için bu durum ayrıca işaretlenir.
class DoseConfirmDialog extends StatelessWidget {
  const DoseConfirmDialog({
    super.key,
    required this.target,
    required this.verification,
  });

  final DoseTarget target;
  final DoseVerification verification;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.outline;
    final now = DateFormat('HH:mm').format(DateTime.now());

    final String? verificationNote;
    final Color verificationColor;
    if (verification.isBarcodeVerified) {
      verificationNote = 'Bileklik ve ilaç barkodu doğrulandı';
      verificationColor = Colors.green.shade700;
    } else if (verification.usedGallery) {
      verificationNote = 'Kod galeriden okundu · barkod doğrulaması sayılmaz';
      verificationColor = Colors.amber.shade900;
    } else if (verification.patientScanned) {
      verificationNote = 'Hasta bilekliği doğrulandı';
      verificationColor = Colors.green.shade700;
    } else {
      verificationNote = null;
      verificationColor = muted;
    }

    return AlertDialog(
      title: const Text('İlaç Onayı'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
              "Bu ilacı 'Verildi' olarak işaretlemek istediğinize emin misiniz?"),
          const SizedBox(height: 12),
          Text('${target.medicationName} ${target.dosage}',
              style: const TextStyle(fontWeight: FontWeight.w700)),
          Text('${target.patientName} · saat $now',
              style: TextStyle(color: muted, fontSize: 13)),
          if (target.nurseNote != null && target.nurseNote!.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.amber.shade50,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.amber.shade200),
              ),
              child: Text('Hemşireye not: ${target.nurseNote}',
                  style: TextStyle(color: Colors.amber.shade900, fontSize: 13)),
            ),
          ],
          if (verificationNote != null) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Icon(
                    verification.isBarcodeVerified || !verification.usedGallery
                        ? Icons.verified_rounded
                        : Icons.info_outline_rounded,
                    size: 16,
                    color: verificationColor),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(verificationNote,
                      style: TextStyle(
                          color: verificationColor,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600)),
                ),
              ],
            ),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text('İptal'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: Colors.green.shade600),
          onPressed: () => Navigator.of(context).pop(true),
          child: const Text('Onayla'),
        ),
      ],
    );
  }
}
