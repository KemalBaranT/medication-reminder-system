import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';
import '../widgets/app_bottom_nav_bar.dart';
import 'patients_list_screen.dart';
import 'today_medications_screen.dart';
import 'wristband_scan_screen.dart';

class _HomeTab {
  final String title;
  final IconData icon;
  final Widget view;

  const _HomeTab({required this.title, required this.icon, required this.view});
}

/// Kimlik dogrulanmis her rol tam olarak ayni iki sekmeyi gorur. Burada
/// kasitli olarak rol basina bir sekme listesi yoktur (bu ekranin daha
/// onceki surumleri "Bugunun Ilaclari"ni hemsire roluyle sinirlamisti; bu
/// da doktorlari ve basemsireleri servis genelindeki doz denetiminden
/// sessizce 403'leyerek disliyordu): gecikmeleri ve hemsire is yukunu
/// denetleyen bir doktor veya basemsire ile tum sistemi gozeten bir admin,
/// bir hemsirenin calistigi ayni canli is listesine ihtiyac duyar, ilac
/// baglami olmayan salt-okunur bir hasta listesine degil. Backend
/// tarafindaki `ScheduleController`, eslesen ayrimi zorunlu kilar - bir
/// hemsire kendi yatak basi is listesini alir, diger her rol servis
/// genelindeki goruntuyu alir - bu yuzden bu ekranin tek karar vermesi
/// gereken sey sekmenin *gosterilip gosterilmeyecegidir*, *ne
/// gosterecegi* degil.
const _tabs = [
  _HomeTab(
      title: 'Bugünün İlaçları',
      icon: Icons.medication_outlined,
      view: TodayMedicationsView()),
  _HomeTab(
      title: 'Hastalar', icon: Icons.groups_outlined, view: PatientsListView()),
];

/// Giristen sonraki uygulamanin ana kabugu: hastane adini ve hesap
/// menusunu tasiyan bir AppBar ile [_tabs] arasinda gecis yapan kalici bir
/// [AppBottomNavBar]. Hesap bilgisi ve cikis islemi, bir Drawer yerine
/// AppBar'in avatar menusunde yasar; boylece alt bar, uygulamadaki tek
/// navigasyon yuzeyi olmakta serbesttir.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tabIndex = 0;

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final user = appState.currentUser;
    final activeIndex = _tabIndex;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_tabs[activeIndex].title),
            Text(
              appState.hospitalName,
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
          ],
        ),
        actions: [
          PopupMenuButton<String>(
            tooltip: 'Hesap',
            offset: const Offset(0, 46),
            icon: CircleAvatar(
              radius: 16,
              backgroundColor: Theme.of(context).colorScheme.primaryContainer,
              child: Text(
                (user?.fullName.isNotEmpty ?? false)
                    ? user!.fullName[0].toUpperCase()
                    : '?',
                style:
                    const TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
              ),
            ),
            itemBuilder: (context) => [
              PopupMenuItem<String>(
                enabled: false,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(user?.displayName ?? '',
                        style: const TextStyle(fontWeight: FontWeight.bold)),
                    Text(
                      user?.roleLabel ?? '',
                      style: TextStyle(
                          color: Theme.of(context).colorScheme.outline,
                          fontSize: 12.5),
                    ),
                  ],
                ),
              ),
              const PopupMenuDivider(),
              const PopupMenuItem<String>(
                value: 'logout',
                child: Row(
                  children: [
                    Icon(Icons.logout, size: 19),
                    SizedBox(width: 10),
                    Text('Çıkış yap'),
                  ],
                ),
              ),
            ],
            onSelected: (value) {
              if (value == 'logout') context.read<AppState>().logout();
            },
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: IndexedStack(
        index: activeIndex,
        children: [for (final tab in _tabs) tab.view],
      ),
      bottomNavigationBar: AppBottomNavBar(
        selectedIndex: activeIndex,
        onDestinationSelected: (i) => setState(() => _tabIndex = i),
        destinations: [
          for (final tab in _tabs)
            AppNavDestination(icon: tab.icon, label: tab.title),
        ],
      ),
      // Bileklik taramaya tek, global giris noktasi - kart basina ve
      // AppBar'a ozel her QR affordance'i kasitli olarak kaldirildi ve
      // yerine bu tek FAB kondu; boylece bir doktor, basemsire, hemsire
      // veya admin, hangi sekmeye veya karta bakarsa baksin tarayiciyi
      // her zaman ayni yerde bulur. Scaffold, bu barin
      // `bottomNavigationBar`i kapladigi icin, Flutter'in yerlesik
      // NavigationBar'inda oldugu gibi onu [AppBottomNavBar]'in ustune
      // otomatik olarak konumlandirir.
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const WristbandScanScreen()),
        ),
        icon: const Icon(Icons.qr_code_scanner_rounded),
        label: const Text('QR Tara'),
      ),
    );
  }
}
