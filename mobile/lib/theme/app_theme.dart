import 'package:flutter/material.dart';

/// Uygulama icin merkezilestirilmis Material 3 temasi. Bilesen temalarini
/// her Card, buton ve metin alaninda sekil/renk kararlarini tekrarlamak
/// yerine burada tanimlamak, her ekrani gorsel olarak tutarli tutar ve tek
/// bir palet degisikliginin tum uygulamaya yayilmasini saglar.
class AppTheme {
  AppTheme._();

  /// Web panelinin "Medical Point" kurumsal marka kirmizisiyla
  /// (--color-brand-600, #C8102E) eslesir; boylece iki istemci, iki
  /// bagimsiz stillendirilmis uygulama yerine tek bir urun gibi okunur.
  /// Material 3'un `ColorScheme.fromSeed`i, tum turlenmis paleti (primary,
  /// primaryContainer, secondaryContainer, vb.) tek bu tohum degerinden
  /// tekrar hesapladigi icin, uygulamadaki cogu bilesen (AppBottomNavBar,
  /// FilledButton, CircleAvatar arka planlari...) kod degistirmeden yeni
  /// kirmiziya gecer.
  static const Color _seed = Color(0xFFC8102E);

  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final colorScheme =
        ColorScheme.fromSeed(seedColor: _seed, brightness: brightness);
    final isDark = brightness == Brightness.dark;

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor:
          isDark ? colorScheme.surface : const Color(0xFFF4F6FA),
      appBarTheme: AppBarTheme(
        // Kasitli olarak temiz/beyaz kalir (kirmizi bir toolbar zemini
        // degil): marka kirmizisi, arka planlar tertemiz beyaz/acik gri
        // kaldigi surece butonlarda ve basliklarda daha net one cikar -
        // bu yuzden kirmizi buraya, arka plana degil, baslik rengine ve
        // FAB/buton gibi vurgu ogelerine tasinir.
        backgroundColor: isDark ? colorScheme.surface : Colors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 1,
        centerTitle: false,
        foregroundColor: colorScheme.onSurface,
        iconTheme: IconThemeData(color: colorScheme.primary),
        titleTextStyle: TextStyle(
          color: colorScheme.primary,
          fontSize: 18,
          fontWeight: FontWeight.w700,
        ),
      ),
      // Varsayilan Material 3 FAB'i, soluk bir primaryContainer tonu
      // kullanir; QR tarayici gibi tek, global bir eylem butonunun tam
      // olarak kurumsal kirmiziyla one cikmasi icin bunun yerine canli
      // `colorScheme.primary` acikca ayarlanir.
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: colorScheme.primary,
        foregroundColor: colorScheme.onPrimary,
        elevation: 2,
        extendedTextStyle:
            const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        margin: EdgeInsets.zero,
        color: isDark ? colorScheme.surfaceContainerLow : Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: BorderSide(
              color: colorScheme.outlineVariant.withValues(alpha: 0.6)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor:
            isDark ? colorScheme.surfaceContainerHigh : const Color(0xFFF8FAFC),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: colorScheme.outlineVariant),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: colorScheme.outlineVariant),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: colorScheme.primary, width: 1.8),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: colorScheme.error),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(48),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          minimumSize: const Size.fromHeight(48),
          elevation: 0,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(48),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 66,
        backgroundColor: isDark ? colorScheme.surface : Colors.white,
        surfaceTintColor: Colors.transparent,
        indicatorColor: colorScheme.primaryContainer,
        labelTextStyle: WidgetStateProperty.all(
          const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
        ),
      ),
      chipTheme: const ChipThemeData(
        side: BorderSide.none,
        labelStyle: TextStyle(fontWeight: FontWeight.w600, fontSize: 12),
        padding: EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      ),
      dividerTheme: DividerThemeData(color: colorScheme.outlineVariant),
    );
  }
}
