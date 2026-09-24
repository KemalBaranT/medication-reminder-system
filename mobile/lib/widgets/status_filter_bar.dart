import 'package:flutter/material.dart';

/// Bir hemsirenin "Bugunun Ilaclari"ni daraltabilecegi doz-durumu
/// kategorileri.
///
/// Bu, backend'in `ScheduleStatus` enum'unun birebir yansimasi degil,
/// arayuz seviyesinde bir gruplamadir: [late_] ve [pending], ayri bir
/// sunucu degeri yerine [MedicationSchedule.isLate] tarafindan bolunen
/// ayni backend durumundan (`notified`/`pending`) gelir, cunku "gecikmis",
/// kayitli bir durum degil, mevcut zamanin bir fonksiyonudur.
/// [administered], bugun `/schedule/mine`in yalnizca bekliyor/bildirildi
/// dozlari dondurmesine ragmen tamlik ve ileriye donuk uyumluluk icin
/// dahil edilmistir - sonuclandirilmis bir doz, kaydedildigi anda is
/// listesinden kaldirilir (bkz. AdministrationLogsService), bu yuzden
/// onu secmek su anda tasarim geregi bos durumu verir, bir hatadan
/// degil.
enum ScheduleStatusFilter {
  all('Tümü'),
  late_('Gecikti'),
  pending('Bekliyor'),
  administered('Verildi');

  final String label;
  const ScheduleStatusFilter(this.label);
}

/// Renk kodlu durum filtresi cipslerinin yatay olarak kayan sirasi.
///
/// [SmartSearchBar] gibi, "aptal", durumsuz bir secici olarak tutulur -
/// kendine ait hicbir filtreleme mantigi tasimaz. Ebeveyn ekran, secili
/// [ScheduleStatusFilter]i kendi State'inde tutar ve gorunur listeyi her
/// build'de yeniden turetir; bu, is listesi olceginde (hemsire basina
/// binlerce degil, onlarca doz) ozel bir ChangeNotifier'i gerektirmeyecek
/// kadar ucuzdur.
class StatusFilterBar extends StatelessWidget {
  const StatusFilterBar(
      {super.key, required this.selected, required this.onChanged});

  final ScheduleStatusFilter selected;
  final ValueChanged<ScheduleStatusFilter> onChanged;

  /// Uygulamanin baska yerlerinde kullanilan klinik aciliyet kuralina
  /// (kirmizi = dikkat gerektirir, amber = bekliyor, yesil = cozuldu) uyan,
  /// filtre basina anlamsal renk. "Tumu" once marka rengini (`scheme.primary`)
  /// tasiyordu, ama marka rengi "Medical Point" revizyonuyla kirmiziya
  /// gectiginden bu, "Gecikti" cipsiyle neredeyse ayni renge denk gelip
  /// ikisini birbirinden ayirt edilemez hale getirirdi; bu yuzden "Tumu"
  /// kasitli olarak notr bir grafit tonuna tasindi.
  Color _colorFor(ScheduleStatusFilter filter) {
    switch (filter) {
      case ScheduleStatusFilter.all:
        return Colors.blueGrey.shade600;
      case ScheduleStatusFilter.late_:
        return Colors.red.shade600;
      case ScheduleStatusFilter.pending:
        return Colors.orange.shade700;
      case ScheduleStatusFilter.administered:
        return Colors.green.shade600;
    }
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 42,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: ScheduleStatusFilter.values.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final filter = ScheduleStatusFilter.values[index];
          final isSelected = filter == selected;
          final color = _colorFor(filter);

          return ChoiceChip(
            label: Text(filter.label),
            selected: isSelected,
            showCheckmark: false,
            onSelected: (_) => onChanged(filter),
            backgroundColor: color.withValues(alpha: 0.1),
            selectedColor: color,
            side: BorderSide.none,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            labelStyle: TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 12.5,
              color: isSelected ? Colors.white : color,
            ),
          );
        },
      ),
    );
  }
}
