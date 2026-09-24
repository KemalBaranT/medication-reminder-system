import 'package:flutter/material.dart';

/// Bir liste ekraninin ustu icin yuzen, golgeli bir arama alani.
///
/// Bu widget tamamen sunum amaclidir ve kendine ait hicbir filtreleme
/// mantigi tasimaz: her tus vurusunu `TextField.onChanged` araciligiyla
/// [onChanged]'e iletir ve sahip ekranin kendi verisi icin "eslesme"nin ne
/// anlama geldigine (hasta adi mi, protokol numarasi mi, ilac adi mi, vb.)
/// karar vermesine izin verir. Widget'i "aptal" tutmak, onu hasta listesi
/// ve bugunun ilaclari is listesi arasinda, hicbir ekranin filtreleme
/// kurallarini bu dosyaya sizdirmasina gerek kalmadan yeniden kullanilabilir
/// kilar.
///
/// Global [InputDecorationTheme] (bkz. `AppTheme`), tasarim geregi her
/// metin alanini duz gri bir arka plan ve bir anahat sinir cizgisiyle
/// doldurur, ama bu burada "sadece baska bir form alani" gibi okunur. Bu
/// widget, arama cubugunun bunun yerine yukseltilmis, yuzen bir affordance
/// gibi okunmasi icin - Material 3'un "belirgin arama" desenini - bu tema
/// varsayilanlarini yerel olarak beyaz/yuzey bir kart, yumusak bir golge
/// ve sinir cizgisi olmadan gecersiz kilar.
class SmartSearchBar extends StatelessWidget {
  const SmartSearchBar(
      {super.key,
      required this.controller,
      required this.onChanged,
      this.hintText = 'Ara...'});

  /// Bu widget tarafindan degil, ebeveyn ekran tarafindan sahiplenilir ve
  /// dispose edilir; boylece mevcut sorgu, ayni ekranin baska bir yerindeki
  /// ilgisiz durum degisikliklerinin (orn. bir plan yenilemesi) tetikledigi
  /// widget yeniden olusturmalarindan sag cikar.
  final TextEditingController controller;
  final String hintText;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      decoration: BoxDecoration(
        color: isDark ? scheme.surfaceContainerHigh : Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: scheme.shadow.withValues(alpha: isDark ? 0.24 : 0.08),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        textInputAction: TextInputAction.search,
        decoration: InputDecoration(
          hintText: hintText,
          filled: false,
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: InputBorder.none,
          prefixIcon: Icon(Icons.search_rounded, color: scheme.outline),
          suffixIcon: ListenableBuilder(
            listenable: controller,
            builder: (context, _) {
              if (controller.text.isEmpty) return const SizedBox.shrink();
              return IconButton(
                icon:
                    Icon(Icons.close_rounded, size: 20, color: scheme.outline),
                tooltip: 'Temizle',
                onPressed: () {
                  controller.clear();
                  onChanged('');
                },
              );
            },
          ),
          contentPadding: const EdgeInsets.symmetric(vertical: 14),
        ),
      ),
    );
  }
}
