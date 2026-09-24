import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../state/app_state.dart';

/// Bir doz kararının kaydedilme sonucunu, ekranlar arasında tutarlı bir
/// görsel dille bildiren yüzen mesaj.
///
/// [ScaffoldMessengerState] dışarıdan alınır; böylece çağıran ekran mesajı
/// gösterdikten hemen sonra kendini kapatabilir ve mesaj, uygulama
/// genelindeki messenger üzerinden alttaki iş listesinde görünmeye devam
/// eder. Hemşire, dozun yeşil "Verildi" kartına dönüştüğünü görürken onay
/// mesajını da aynı anda okur.
///
/// Çevrimdışı kuyruğa alınan kayıt kasıtlı olarak "başarılı" tonuyla değil,
/// kehribar bir "cihazda saklandı" mesajıyla gösterilir: kayıt kaybolmamıştır
/// ama henüz merkezi sistemde (diğer hemşirelerin ve doktorların
/// ekranlarında) görünmez. Bunu hemşireden gizlemek, aynı dozun başka bir
/// cihazdan tekrar uygulanmasına zemin hazırlardı.
void showDoseRecordFeedback(
  ScaffoldMessengerState messenger,
  DoseRecordResult result, {
  required String medicationName,
  required String dosage,
  required String patientName,
  required String action,
}) {
  final administered = action == 'administered';
  final time = DateFormat('HH:mm').format(result.performedAt ?? DateTime.now());
  final detail = '$medicationName $dosage · $patientName · $time';

  final (color, icon, title, subtitle) = switch (result.outcome) {
    DoseRecordOutcome.synced => (
        Colors.green.shade700,
        Icons.check_circle_rounded,
        administered
            ? 'İlaç başarıyla uygulandı'
            : 'Uygulanmadı olarak kaydedildi',
        detail,
      ),
    DoseRecordOutcome.queuedOffline => (
        Colors.amber.shade800,
        Icons.cloud_upload_outlined,
        administered
            ? 'Uygulama cihazda kaydedildi'
            : 'Karar cihazda kaydedildi',
        'Bağlantı gelince otomatik gönderilecek · $detail',
      ),
    DoseRecordOutcome.alreadyRecorded => (
        Colors.red.shade700,
        Icons.block_rounded,
        'Bu doz zaten kaydedilmiş',
        'Başka bir kayıt bu dozu kapatmış; liste güncellendi.',
      ),
    DoseRecordOutcome.failed => (
        Colors.red.shade700,
        Icons.error_outline_rounded,
        'Kayıt yapılamadı',
        result.message ?? 'Beklenmeyen bir hata oluştu.',
      ),
  };

  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(_styledSnackBar(
      color: color,
      icon: icon,
      title: title,
      subtitle: subtitle,
      duration: const Duration(seconds: 4),
    ));
}

/// Onaylanmış ama henüz gönderilmemiş (bkz. [AppState.stageAdministration])
/// bir "Verildi" kararının bildirimi; "Geri Al" düğmesi taşır.
///
/// Snackbar'ın süresi, kaydın cihazda bekletildiği süreyle aynıdır:
/// bildirim ekranda olduğu sürece geri alma mümkündür, kaybolduğunda kayıt
/// gönderilmiştir. Böylece hemşire, geri alma imkânının ne zaman sona
/// erdiğini ayrıca düşünmek zorunda kalmaz.
void showUndoableAdministrationSnackBar(
  ScaffoldMessengerState messenger, {
  required String medicationName,
  required String dosage,
  required String patientName,
  required VoidCallback onUndo,
  Duration duration = const Duration(seconds: 5),
}) {
  final time = DateFormat('HH:mm').format(DateTime.now());
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(_styledSnackBar(
      color: Colors.green.shade700,
      icon: Icons.check_circle_rounded,
      title: 'Verildi olarak işaretlendi',
      subtitle: '$medicationName $dosage · $patientName · $time',
      duration: duration,
      action: SnackBarAction(
        label: 'GERİ AL',
        textColor: Colors.white,
        onPressed: onUndo,
      ),
    ));
}

/// "Geri Al" sonrasında kaydın hiç gönderilmediğini teyit eden kısa bildirim.
void showUndoneSnackBar(ScaffoldMessengerState messenger) {
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(_styledSnackBar(
      color: Colors.blueGrey.shade700,
      icon: Icons.undo_rounded,
      title: 'İşlem geri alındı',
      subtitle: 'Kayıt gönderilmedi; doz yeniden bekleyen durumda.',
      duration: const Duration(seconds: 3),
    ));
}

/// Doz kayıt bildirimlerinin ortak görsel kabuğu (yüzen, yuvarlak köşeli,
/// ikonlu iki satır); tüm bildirimlerin aynı dilde görünmesini sağlar.
SnackBar _styledSnackBar({
  required Color color,
  required IconData icon,
  required String title,
  required String subtitle,
  required Duration duration,
  SnackBarAction? action,
}) {
  return SnackBar(
    behavior: SnackBarBehavior.floating,
    backgroundColor: color,
    duration: duration,
    margin: const EdgeInsets.fromLTRB(12, 0, 12, 16),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    action: action,
    content: Row(
      children: [
        Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.2),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: Colors.white, size: 22),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title,
                  style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 15)),
              const SizedBox(height: 2),
              Text(subtitle,
                  style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.9),
                      fontSize: 12.5)),
            ],
          ),
        ),
      ],
    ),
  );
}
