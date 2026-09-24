import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/dose_slot.dart';
import '../models/dose_target.dart';

/// Hemşirenin bir doz için seçebileceği yol.
enum DoseAction {
  /// Bileklik ve ilaç barkodu okutularak, barkod doğrulamalı kayıt.
  qr,

  /// QR kullanılmadan, o anki saatle "Verildi" kaydı.
  manual,

  /// Doz verilmedi; standart bir nedenle raporlanır.
  notAdministered,
}

/// Bir doz kartına dokunulduğunda açılan eylem menüsünü gösterir; hemşire
/// menüyü seçim yapmadan kapatırsa `null` döner.
Future<DoseAction?> showDoseActionSheet(
    BuildContext context, DoseTarget target) {
  return showModalBottomSheet<DoseAction>(
    context: context,
    useSafeArea: true,
    showDragHandle: true,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (_) => DoseActionSheet(target: target),
  );
}

/// İlaç uygulama akışının giriş noktası.
///
/// **Neden kamera doğrudan açılmıyor:** QR doğrulaması süreci hızlandıran
/// bir seçenektir, zorunlu bir geçit değildir. Bileklik kopmuş, kamera
/// arızalı veya ilaç kutusunda barkod olmayabilir; kartın kamerayı
/// doğrudan açması bu durumlarda hemşireyi çıkışsız bırakırdı. Menü iki
/// eşdeğer yolu yan yana sunar: barkod doğrulamalı hızlı onay ve manuel
/// kayıt. Hangisinin seçildiği denetim kaydına yansır (bkz.
/// [DoseVerification]); böylece esneklik izlenebilirlikten ödün vermez.
class DoseActionSheet extends StatelessWidget {
  const DoseActionSheet({super.key, required this.target});

  final DoseTarget target;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final timing = DoseTiming.between(target.scheduledTime, DateTime.now());
    final timingColor = switch (timing.kind) {
      DoseTimingKind.onTime => Colors.green.shade700,
      DoseTimingKind.late => Colors.red.shade700,
      DoseTimingKind.early => Colors.blue.shade700,
    };

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('${target.medicationName} · ${target.dosage}',
              style: theme.textTheme.titleLarge
                  ?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text('${target.patientName} · ${target.locationLabel}',
              style: TextStyle(color: theme.colorScheme.outline)),
          const SizedBox(height: 8),
          Row(
            children: [
              Icon(Icons.schedule_rounded,
                  size: 16, color: theme.colorScheme.outline),
              const SizedBox(width: 4),
              Text(
                  'Planlanan ${DateFormat('HH:mm').format(target.scheduledTime)}',
                  style: const TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: timingColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(timing.label,
                    style: TextStyle(
                        color: timingColor,
                        fontSize: 12,
                        fontWeight: FontWeight.w700)),
              ),
            ],
          ),
          const SizedBox(height: 18),
          _ActionTile(
            icon: Icons.qr_code_scanner_rounded,
            color: theme.colorScheme.primary,
            title: 'QR ile Hızlı Onayla',
            subtitle: target.hasMedicationBarcode
                ? 'Bileklik ve ilaç barkodunu okutun · barkod doğrulamalı kayıt'
                : 'Bilekliği okutun · bu ilacın katalogda barkodu yok',
            badge: 'Önerilen',
            onTap: () => Navigator.of(context).pop(DoseAction.qr),
          ),
          const SizedBox(height: 10),
          _ActionTile(
            icon: Icons.touch_app_rounded,
            color: Colors.green.shade700,
            title: 'Manuel Olarak Verildi İşaretle',
            subtitle: 'QR gerekmez · o anki saatle kaydedilir',
            onTap: () => Navigator.of(context).pop(DoseAction.manual),
          ),
          const SizedBox(height: 6),
          TextButton.icon(
            style: TextButton.styleFrom(foregroundColor: Colors.red.shade700),
            onPressed: () =>
                Navigator.of(context).pop(DoseAction.notAdministered),
            icon: const Icon(Icons.block_rounded, size: 18),
            label: const Text('Uygulanmadı olarak bildir'),
          ),
        ],
      ),
    );
  }
}

/// Menüdeki büyük, tek dokunuşla seçilen yol kartı. Eldivenli elle ve
/// hareket halindeyken rahatça hedeflenebilmesi için tüm satır tıklanabilir.
class _ActionTile extends StatelessWidget {
  const _ActionTile({
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.badge,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String subtitle;
  final String? badge;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color.withValues(alpha: 0.06),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: color.withValues(alpha: 0.35)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                    color: color, borderRadius: BorderRadius.circular(14)),
                child: Icon(icon, color: Colors.white, size: 26),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(title,
                              style: TextStyle(
                                  color: color,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w800)),
                        ),
                        if (badge != null) ...[
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 6, vertical: 1),
                            decoration: BoxDecoration(
                              color: color,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(badge!,
                                style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 10.5,
                                    fontWeight: FontWeight.w700)),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(subtitle,
                        style: TextStyle(
                            color: Theme.of(context).colorScheme.outline,
                            fontSize: 12.5)),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: color),
            ],
          ),
        ),
      ),
    );
  }
}
