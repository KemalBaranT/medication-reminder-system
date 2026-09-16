import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/medication_schedule.dart';
import '../state/app_state.dart';

const _reasons = {
  'patient_asleep': 'Hasta uyuyor',
  'refused': 'Hasta reddetti',
  'discharged': 'Hasta taburcu oldu',
  'unavailable': 'Ilac stokta yok',
  'other': 'Diger',
};

class FeedbackScreen extends StatefulWidget {
  final MedicationSchedule schedule;
  final bool barcodeVerified;

  const FeedbackScreen({super.key, required this.schedule, required this.barcodeVerified});

  @override
  State<FeedbackScreen> createState() => _FeedbackScreenState();
}

class _FeedbackScreenState extends State<FeedbackScreen> {
  String? _selectedReason;
  final _notesController = TextEditingController();
  bool _submitting = false;

  Future<void> _submit(String action) async {
    setState(() => _submitting = true);
    await context.read<AppState>().submitFeedback(
          scheduleId: widget.schedule.id,
          action: action,
          reason: action == 'not_administered' ? _selectedReason : null,
          barcodeVerified: widget.barcodeVerified,
          notes: _notesController.text.isEmpty ? null : _notesController.text,
        );
    if (!mounted) return;
    Navigator.of(context).popUntil((route) => route.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.schedule;
    return Scaffold(
      appBar: AppBar(title: const Text('Ilac Geri Bildirimi')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('${s.patientName} - Oda ${s.roomNo}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            Text('${s.medicationName} - ${s.dosage}'),
            const SizedBox(height: 24),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: Colors.green),
              onPressed: _submitting ? null : () => _submit('administered'),
              child: const Text('Uygulandi'),
            ),
            const SizedBox(height: 24),
            const Text('Uygulanmadiysa nedeni:', style: TextStyle(fontWeight: FontWeight.bold)),
            ..._reasons.entries.map(
              (e) => RadioListTile<String>(
                title: Text(e.value),
                value: e.key,
                groupValue: _selectedReason,
                onChanged: (v) => setState(() => _selectedReason = v),
              ),
            ),
            TextField(
              controller: _notesController,
              decoration: const InputDecoration(labelText: 'Not (opsiyonel)'),
            ),
            const SizedBox(height: 16),
            OutlinedButton(
              onPressed: (_submitting || _selectedReason == null) ? null : () => _submit('not_administered'),
              child: const Text('Uygulanmadi Olarak Kaydet'),
            ),
          ],
        ),
      ),
    );
  }
}
