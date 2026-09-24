import 'package:flutter/material.dart';

/// Kaydırma hareketi sırasında kartın altında beliren eylem zemini.
/// "Bugünün İlaçları" listesi ve hasta dosyasındaki günlük takvim aynı
/// bileşeni kullanır; böylece iki ekranda da sağa kaydırma yeşil "Verildi",
/// sola kaydırma koyu "QR ile Onayla" olarak aynı görsel dille okunur.
class SwipeActionBackground extends StatelessWidget {
  const SwipeActionBackground({
    super.key,
    required this.alignment,
    required this.color,
    required this.icon,
    required this.label,
    this.margin = const EdgeInsets.symmetric(vertical: 6),
    this.radius = 18,
  });

  final Alignment alignment;
  final Color color;
  final IconData icon;
  final String label;
  final EdgeInsets margin;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final leading = alignment == Alignment.centerLeft;
    final children = [
      Icon(icon, color: Colors.white),
      const SizedBox(width: 8),
      Text(label,
          style: const TextStyle(
              color: Colors.white, fontSize: 16, fontWeight: FontWeight.w800)),
    ];
    return Container(
      alignment: alignment,
      padding: const EdgeInsets.symmetric(horizontal: 24),
      margin: margin,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(radius),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: leading ? children : children.reversed.toList(),
      ),
    );
  }
}
