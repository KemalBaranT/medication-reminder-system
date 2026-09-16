import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';
import 'scan_match_screen.dart';

class TodayMedicationsScreen extends StatefulWidget {
  const TodayMedicationsScreen({super.key});

  @override
  State<TodayMedicationsScreen> createState() => _TodayMedicationsScreenState();
}

class _TodayMedicationsScreenState extends State<TodayMedicationsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => context.read<AppState>().refreshSchedule());
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final timeFormat = DateFormat('HH:mm');

    return Scaffold(
      appBar: AppBar(
        title: const Text('Bugunun Ilaclari'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => context.read<AppState>().logout(),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => appState.refreshSchedule(),
        child: appState.isLoading && appState.schedules.isEmpty
            ? const Center(child: CircularProgressIndicator())
            : appState.error != null
                ? Center(child: Text(appState.error!))
                : ListView.builder(
                    itemCount: appState.schedules.length,
                    itemBuilder: (context, index) {
                      final s = appState.schedules[index];
                      final isLate = s.status == 'notified' && s.scheduledTime.isBefore(DateTime.now());
                      return ListTile(
                        leading: CircleAvatar(
                          backgroundColor: isLate ? Colors.red : Colors.blue,
                          child: Text(timeFormat.format(s.scheduledTime)),
                        ),
                        title: Text('${s.patientName} - Oda ${s.roomNo}'),
                        subtitle: Text('${s.medicationName} - ${s.dosage}'),
                        trailing: const Icon(Icons.qr_code_scanner),
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => ScanMatchScreen(schedule: s)),
                        ),
                      );
                    },
                  ),
      ),
    );
  }
}
