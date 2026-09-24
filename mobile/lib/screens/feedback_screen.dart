import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../flows/dose_administration_flow.dart';
import '../models/dose_target.dart';
import '../state/app_state.dart';
import '../widgets/dose_record_feedback.dart';

const _reasons = {
  'patient_asleep': 'Hasta uyuyor',
  'refused': 'Hasta reddetti',
  'discharged': 'Hasta taburcu oldu',
  'unavailable': 'İlaç stokta yok',
  'other': 'Diğer',
};

/// İlaç uygulama akışının "uygulanmadı" kolu. Eylem menüsünden veya onay
/// sayfasından "Uygulanmadı olarak bildir" seçildiğinde açılır; QR
/// doğrulaması yapılmış olması gerekmez. Hasta uyuyor, reddetti, ilaç yok
/// gibi standartlaştırılmış bir nedenle kaydı raporlanabilir kılar; bu
/// nedenler uyumluluk raporlarında ayrı ayrı sayılır. Nadir durumlar için
/// "Uygulandı" butonu burada da korunur (örneğin hasta önce reddedip sonra
/// kabul ettiğinde), böylece hemşire akışı baştan başlatmak zorunda kalmaz.
///
/// Kayıt [AppState.submitFeedback] üzerinden yapılır; bağlantı yoksa karar
/// çevrimdışı kuyruğa alınır. Kalıcı hale gelen karar [DoseFlowResult]
/// olarak akışı başlatan ekrana döndürülür; başarı mesajını ve ekranın
/// canlı güncellemesini o ekran üstlenir.
class FeedbackScreen extends StatefulWidget {
  final DoseTarget target;

  /// Bu karardan önce QR ile barkod doğrulaması yapıldıysa `true`; denetim
  /// kaydına aynen yansır.
  final bool barcodeVerified;

  const FeedbackScreen(
      {super.key, required this.target, required this.barcodeVerified});

  @override
  State<FeedbackScreen> createState() => _FeedbackScreenState();
}

class _FeedbackScreenState extends State<FeedbackScreen> {
  String? _selectedReason;
  final _notesController = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  /// Kararı gönderir. Kalıcı bir hatada hemşire bu ekranda kalır ki
  /// girdiği neden ve notu kaybetmeden tekrar deneyebilsin; aksi halde
  /// ekran sonuçla birlikte kapanır.
  Future<void> _submit(String action) async {
    setState(() => _submitting = true);
    final messenger = ScaffoldMessenger.of(context);
    final result = await context.read<AppState>().submitFeedback(
          scheduleId: widget.target.scheduleId,
          action: action,
          reason: action == 'not_administered' ? _selectedReason : null,
          barcodeVerified: widget.barcodeVerified,
          notes: _notesController.text.isEmpty ? null : _notesController.text,
        );
    if (!mounted) return;
    if (result.outcome == DoseRecordOutcome.failed) {
      showDoseRecordFeedback(messenger, result,
          medicationName: widget.target.medicationName,
          dosage: widget.target.dosage,
          patientName: widget.target.patientName,
          action: action);
      setState(() => _submitting = false);
      return;
    }
    Navigator.of(context).pop(DoseFlowResult(result, action));
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.target;
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('İlaç Geri Bildirimi')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(s.patientName,
                        style: const TextStyle(
                            fontSize: 17, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(Icons.location_on_outlined,
                            size: 15, color: theme.colorScheme.outline),
                        const SizedBox(width: 4),
                        Text(s.locationLabel,
                            style: TextStyle(color: theme.colorScheme.outline)),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Text('${s.medicationName} - ${s.dosage}',
                        style: const TextStyle(
                            fontWeight: FontWeight.w600, fontSize: 15)),
                    if (s.prescriberDisplay != null) ...[
                      const SizedBox(height: 3),
                      Text(
                        'Reçete eden: ${s.prescriberDisplay}',
                        style: TextStyle(
                            color: theme.colorScheme.outline, fontSize: 12),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            if (s.nurseNote != null && s.nurseNote!.isNotEmpty) ...[
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.amber.shade50,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.amber.shade200),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.warning_amber_rounded,
                        size: 19, color: Colors.amber.shade800),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        s.nurseNote!,
                        style: TextStyle(
                            color: Colors.amber.shade900,
                            fontWeight: FontWeight.w500,
                            height: 1.3),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 24),
            SizedBox(
              height: 48,
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.green.shade600,
                    foregroundColor: Colors.white),
                onPressed: _submitting ? null : () => _submit('administered'),
                icon: const Icon(Icons.check_circle_outline),
                label: const Text('Uygulandı',
                    style:
                        TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
              ),
            ),
            const SizedBox(height: 28),
            const Text('Uygulanmadıysa nedeni:',
                style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            RadioGroup<String>(
              groupValue: _selectedReason,
              onChanged: (v) => setState(() => _selectedReason = v),
              child: Column(
                children: _reasons.entries
                    .map(
                      (e) => RadioListTile<String>(
                        title: Text(e.value),
                        value: e.key,
                        contentPadding: EdgeInsets.zero,
                      ),
                    )
                    .toList(),
              ),
            ),
            TextField(
              controller: _notesController,
              decoration: const InputDecoration(
                  labelText: 'Not (opsiyonel)', border: OutlineInputBorder()),
              maxLines: 2,
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 48,
              child: OutlinedButton(
                style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.red.shade700,
                    side: BorderSide(color: Colors.red.shade200)),
                onPressed: (_submitting || _selectedReason == null)
                    ? null
                    : () => _submit('not_administered'),
                child: const Text('Uygulanmadı Olarak Kaydet',
                    style:
                        TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
