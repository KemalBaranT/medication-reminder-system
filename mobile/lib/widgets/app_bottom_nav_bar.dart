import 'package:flutter/material.dart';

/// [AppBottomNavBar] icindeki tek bir hedef.
class AppNavDestination {
  const AppNavDestination({required this.icon, required this.label});

  final IconData icon;
  final String label;
}

/// Uygulamanin kalici alt navigasyon yuzeyi.
///
/// Flutter'in Material [NavigationBar]i `destinations.length >= 2`i zorunlu
/// kilar ve aksi durumda render etmeyi reddeder - bu, bir tasarim tercihi
/// degil, sert bir framework kisitidir. Bu yuzden barin sekme sayisina
/// bagli tutulmasina yonelik her onceki girisim, ya tek-hedefli rolleri
/// cokertiyor ya da bari onlar icin tamamen gizliyordu; bu da bir doktor/
/// basemsire/admin oturumunu hicbir gorunur yon bulma kabugu olmadan
/// birakiyordu. Bu widget, ayni Material 3 gorunumunu (secili ikonun
/// arkasindaki hap gostergesi, kalin secili etiket) yeniden uygular ama
/// tam olarak bir dahil herhangi bir hedef sayisini kabul eder; boylece
/// kimlik dogrulanmis her rol - rolunun kac bolum gorebildiginden
/// bagimsiz olarak - kendisine nerede oldugunu soyleyen, ozdes ve her
/// zaman gorunur bir alt kabuk alir.
class AppBottomNavBar extends StatelessWidget {
  const AppBottomNavBar(
      {super.key,
      required this.destinations,
      required this.selectedIndex,
      required this.onDestinationSelected});

  final List<AppNavDestination> destinations;
  final int selectedIndex;
  final ValueChanged<int> onDestinationSelected;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: isDark ? scheme.surface : Colors.white,
        border: Border(
            top: BorderSide(
                color: scheme.outlineVariant.withValues(alpha: 0.6))),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 66,
          child: Row(
            children: [
              for (var i = 0; i < destinations.length; i++)
                Expanded(
                  child: _NavItem(
                    destination: destinations[i],
                    selected: i == selectedIndex,
                    onTap: () => onDestinationSelected(i),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem(
      {required this.destination, required this.selected, required this.onTap});

  final AppNavDestination destination;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final color =
        selected ? scheme.onSecondaryContainer : scheme.onSurfaceVariant;

    return InkWell(
      onTap: onTap,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
            decoration: BoxDecoration(
              color: selected ? scheme.secondaryContainer : Colors.transparent,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(destination.icon, color: color, size: 22),
          ),
          const SizedBox(height: 4),
          Text(
            destination.label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
              color: selected ? scheme.onSurface : scheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}
