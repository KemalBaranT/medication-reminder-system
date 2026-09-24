import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/patient.dart';
import '../state/app_state.dart';
import '../widgets/smart_search_bar.dart';
import '../widgets/state_views.dart';

/// HomeScreen'in "Hastalar" sekmesinde gosterilen govde widget'i.
/// Servisteki hastalarin genel durumunu salt-okunur olarak listeler;
/// hasta ekleme/duzenleme web panelinden yapilir.
///
/// Yuzlerce hastalik bir serviste asagi kaydirarak dogru hastayi bulmak
/// pratik olmadigi icin, en ustteki [SmartSearchBar] ad/soyad veya protokol
/// numarasina gore anlik (debounce'suz - liste zaten yerel bellekte oldugu
/// icin ekstra gecikme gereksiz) istemci tarafi filtreleme uygular. Filtre
/// metni sunucuya gitmez; `AppState.patients` zaten tamamen yuklenmis
/// durumdadir, bu yuzden filtreleme sadece goruntuleme katmanini etkiler.
class PatientsListView extends StatefulWidget {
  const PatientsListView({super.key});

  @override
  State<PatientsListView> createState() => _PatientsListViewState();
}

class _PatientsListViewState extends State<PatientsListView> {
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance
        .addPostFrameCallback((_) => context.read<AppState>().loadPatients());
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  /// Ad/soyad (tek `fullName` alaninda birlesik oldugu icin ikisi de bu
  /// tek `contains` ile kapsanir) veya protokol numarasindan herhangi
  /// birine gore eslesen hastalari dondurur.
  List<Patient> _filter(List<Patient> patients) {
    final query = _query.trim().toLowerCase();
    if (query.isEmpty) return patients;
    return patients
        .where((p) =>
            p.fullName.toLowerCase().contains(query) ||
            p.hospitalPatientNo.toLowerCase().contains(query))
        .toList();
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'discharged':
        return Colors.grey;
      case 'transferred':
        return Colors.orange;
      default:
        return Colors.green;
    }
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final filteredPatients = _filter(appState.patients);

    Widget body;
    if (appState.isLoadingPatients && appState.patients.isEmpty) {
      body = const LoadingView();
    } else if (appState.patientsError != null && appState.patients.isEmpty) {
      body = ErrorView(
        message: appState.patientsError!,
        onRetry: () => appState.loadPatients(),
      );
    } else if (appState.patients.isEmpty) {
      body = const EmptyView(
        icon: Icons.groups_outlined,
        message: 'Kayıtlı hasta bulunamadı.',
      );
    } else if (filteredPatients.isEmpty) {
      // Servis dolu ama arama sorgusuyla eslesen yok: bunu servis-genelinde
      // "hasta yok" durumundan ayri bir mesajla gostermek, hemsirenin bunu
      // bir baglanti/veri sorunu sanmasini engeller.
      body = const EmptyView(
        icon: Icons.search_off_rounded,
        message: 'Sonuç bulunamadı.',
      );
    } else {
      body = ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        itemCount: filteredPatients.length,
        itemBuilder: (context, index) {
          final Patient p = filteredPatients[index];
          final theme = Theme.of(context);
          return Card(
            margin: const EdgeInsets.symmetric(vertical: 6),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    radius: 22,
                    backgroundColor: theme.colorScheme.primaryContainer,
                    child: Text(
                      p.fullName.isNotEmpty ? p.fullName[0].toUpperCase() : '?',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                p.fullName,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 15.5),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            StatusChip(
                                label: p.statusLabel,
                                color: _statusColor(p.status)),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Protokol ${p.hospitalPatientNo}',
                          style: TextStyle(
                              color: theme.colorScheme.outline, fontSize: 12.5),
                        ),
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            Icon(Icons.location_on_outlined,
                                size: 15, color: theme.colorScheme.primary),
                            const SizedBox(width: 4),
                            Expanded(
                              child: Text(
                                p.locationLabel,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w600,
                                    fontSize: 13.5),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      );
    }

    return Column(
      children: [
        SmartSearchBar(
          controller: _searchController,
          hintText: 'Ad, soyad veya protokol no ara...',
          onChanged: (value) => setState(() => _query = value),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => appState.loadPatients(),
            child: body,
          ),
        ),
      ],
    );
  }
}
