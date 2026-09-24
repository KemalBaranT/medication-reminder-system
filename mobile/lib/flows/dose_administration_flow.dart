import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../models/dose_target.dart';
import '../screens/feedback_screen.dart';
import '../screens/scan_match_screen.dart';
import '../state/app_state.dart';
import '../widgets/dose_action_sheet.dart';
import '../widgets/dose_confirm_dialog.dart';
import '../widgets/dose_record_feedback.dart';

/// Tamamlanmış bir doz kararının sonucu: kaydın durumu ve verilen karar
/// (`administered` / `not_administered`). Akışı başlatan ekran, listeyi
/// sunucudan yeniden çekmeden yerinde güncellemek için bunu kullanır.
class DoseFlowResult {
  const DoseFlowResult(this.record, this.action);

  final DoseRecordResult record;
  final String action;

  bool get isAdministered => action == 'administered';
}

/// "Verildi" kararı onaylandığında (kayıt henüz "Geri Al" süresinde,
/// gönderilmeden önce) çağrılır; ekran dozu iyimser olarak yeşil gösterir.
typedef DoseStagedCallback = void Function(DateTime confirmedAt);

/// **Manuel onay yolu** (kartı soldan sağa kaydırma): "İlaç Onayı"
/// penceresini gösterir; "Onayla" ile dozu o anki saatle "Verildi" olarak
/// kaydeder. Hemşire "İptal" derse veya "Geri Al"a basarsa `null` döner.
///
/// **Neden onay penceresi:** Kaydırma hızlı bir harekettir ve servis
/// yoğunluğunda yanlış karta da yapılabilir. Klinik kayıt değiştirilemez
/// olduğu için işlem tek bir basit soruyla ("emin misiniz?") güvenceye
/// alınır; pencere sade tutulmuştur ki personeli yavaşlatmasın.
///
/// **Geri Al:** Onaydan sonra kart anında yeşile döner ve Snackbar'da
/// birkaç saniye "Geri Al" seçeneği sunulur. Kayıt bu süre boyunca cihazda
/// bekletilir ve süre dolunca sunucuya gönderilir; geri alınırsa sunucuya
/// hiçbir şey gitmez (bkz. [AppState.stageAdministration]). Kayıt her
/// durumda onaylandığı anın saatiyle damgalanır.
///
/// QR yolu da doğrulamadan sonra aynı pencereyi ve aynı "Geri Al"
/// mekanizmasını kullanır ([verification] ile); iki yolun tek farkı denetim
/// kaydındaki `barcodeVerified` bilgisidir.
Future<DoseFlowResult?> confirmAndAdministerDose(
  BuildContext context,
  DoseTarget target, {
  DoseVerification verification = DoseVerification.manual,
  DoseStagedCallback? onStaged,
  VoidCallback? onUndone,
}) async {
  final messenger = ScaffoldMessenger.of(context);
  final appState = context.read<AppState>();

  final confirmed = await showDoseConfirmDialog(context,
      target: target, verification: verification);
  if (!confirmed) return null;

  HapticFeedback.mediumImpact();
  final pending = appState.stageAdministration(
    scheduleId: target.scheduleId,
    barcodeVerified: verification.isBarcodeVerified,
  );
  onStaged?.call(DateTime.now());
  showUndoableAdministrationSnackBar(
    messenger,
    medicationName: target.medicationName,
    dosage: target.dosage,
    patientName: target.patientName,
    onUndo: () => appState.undoStagedAdministration(target.scheduleId),
  );

  final record = await pending;
  if (record == null) {
    onUndone?.call();
    showUndoneSnackBar(messenger);
    return null;
  }
  if (record.outcome != DoseRecordOutcome.synced) {
    showDoseRecordFeedback(messenger, record,
        medicationName: target.medicationName,
        dosage: target.dosage,
        patientName: target.patientName,
        action: 'administered');
  }
  if (record.outcome == DoseRecordOutcome.failed) {
    onUndone?.call();
    return null;
  }
  return DoseFlowResult(record, 'administered');
}

/// **QR yolu** (kartı sağdan sola kaydırma): o doza ait bileklik/ilaç
/// barkodu doğrulaması için global tarayıcı ekranını ([ScanMatchScreen])
/// doğrudan açar; arada menü yoktur. Doğrulama tamamlanınca manuel yol ile
/// aynı "İlaç Onayı" penceresi, doğrulama bilgisiyle birlikte gösterilir.
/// İki barkodun eşleşmesi ilacın *hazır* olduğunu kanıtlar, *verildiğini*
/// değil; bu yüzden kayıt kendiliğinden yapılmaz, hemşirenin onayını bekler.
Future<DoseFlowResult?> scanAndAdministerDose(
  BuildContext context,
  DoseTarget target, {
  DoseStagedCallback? onStaged,
  VoidCallback? onUndone,
}) async {
  final verification = await Navigator.of(context).push<DoseVerification>(
    MaterialPageRoute(builder: (_) => ScanMatchScreen(target: target)),
  );
  if (verification == null || !context.mounted) return null;
  return confirmAndAdministerDose(context, target,
      verification: verification, onStaged: onStaged, onUndone: onUndone);
}

/// Bir doz için tüm seçenekleri sunan ayrıntılı akış: hasta dosyasındaki
/// günlük ilaç takviminde bir doza dokunulduğunda açılır. Eylem menüsü
/// ([DoseActionSheet]) QR ile onay, manuel onay ve "uygulanmadı" bildirimini
/// sunar; ilk ikisi kaydırma hareketleriyle aynı fonksiyonlara
/// ([scanAndAdministerDose], [confirmAndAdministerDose]) çıkar, üçüncüsü
/// neden formunu ([FeedbackScreen]) açar. "Uygulanmadı" bildirimi
/// kaydırma hareketleriyle yapılamaz; bu bilinçli olarak ayrıntılı yolda
/// tutulmuştur, çünkü standart bir neden seçimi gerektirir.
Future<DoseFlowResult?> runDoseAdministrationFlow(
  BuildContext context,
  DoseTarget target, {
  DoseStagedCallback? onStaged,
  VoidCallback? onUndone,
}) async {
  final messenger = ScaffoldMessenger.of(context);
  final navigator = Navigator.of(context);

  final choice = await showDoseActionSheet(context, target);
  if (choice == null || !context.mounted) return null;

  switch (choice) {
    case DoseAction.qr:
      return scanAndAdministerDose(context, target,
          onStaged: onStaged, onUndone: onUndone);
    case DoseAction.manual:
      return confirmAndAdministerDose(context, target,
          onStaged: onStaged, onUndone: onUndone);
    case DoseAction.notAdministered:
      final result = await navigator.push<DoseFlowResult>(
        MaterialPageRoute(
          builder: (_) =>
              FeedbackScreen(target: target, barcodeVerified: false),
        ),
      );
      if (result != null) {
        showDoseRecordFeedback(messenger, result.record,
            medicationName: target.medicationName,
            dosage: target.dosage,
            patientName: target.patientName,
            action: result.action);
      }
      return result;
  }
}
