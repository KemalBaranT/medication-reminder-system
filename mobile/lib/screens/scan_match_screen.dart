import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../models/medication_schedule.dart';
import 'feedback_screen.dart';

enum _ScanStep { patient, medication }

/// Hemsire once hasta bilekligini, sonra ilac kutusunu okutur. Ikisi de
/// beklenen kodlarla eslesmezse "Uygulandi" akisina gecilemez - yanlis hastaya
/// yanlis ilac verilmesini engelleyen guvenlik adimi budur.
class ScanMatchScreen extends StatefulWidget {
  final MedicationSchedule schedule;

  const ScanMatchScreen({super.key, required this.schedule});

  @override
  State<ScanMatchScreen> createState() => _ScanMatchScreenState();
}

class _ScanMatchScreenState extends State<ScanMatchScreen> {
  _ScanStep _step = _ScanStep.patient;
  String? _error;
  bool _handled = false;

  void _onDetect(BarcodeCapture capture) {
    if (_handled) return;
    final code = capture.barcodes.firstOrNull?.rawValue;
    if (code == null) return;

    if (_step == _ScanStep.patient) {
      if (code != widget.schedule.patientWristbandCode) {
        setState(() => _error = 'Yanlis hasta bilekligi! Bu ilac ${widget.schedule.patientName} icin.');
        return;
      }
      setState(() {
        _step = _ScanStep.medication;
        _error = null;
      });
      return;
    }

    if (code != widget.schedule.medicationBarcode) {
      setState(() => _error = 'Yanlis ilac! Beklenen: ${widget.schedule.medicationName}');
      return;
    }

    _handled = true;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => FeedbackScreen(schedule: widget.schedule, barcodeVerified: true),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final label = _step == _ScanStep.patient ? 'Hasta bilekligini okutun' : 'Ilac kutusunu okutun';
    return Scaffold(
      appBar: AppBar(title: Text(label)),
      body: Stack(
        children: [
          MobileScanner(onDetect: _onDetect),
          if (_error != null)
            Positioned(
              bottom: 24,
              left: 16,
              right: 16,
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Colors.red.shade700, borderRadius: BorderRadius.circular(8)),
                child: Text(_error!, style: const TextStyle(color: Colors.white)),
              ),
            ),
        ],
      ),
    );
  }
}

extension _FirstOrNull<T> on List<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
