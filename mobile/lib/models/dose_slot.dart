/// Esnek ilaç uygulama akışının zaman kuralları. Hasta dosyasındaki
/// "İlacı Ver" eylemi, gecikti/erken rozetleri ve günlük takvimdeki sapma
/// metni bu tek kaynaktan beslenir; web panelindeki `lib/doseTiming.ts`
/// ile aynı eşikleri kullanır ki iki istemci aynı dozu aynı şekilde
/// sınıflandırsın.
///
/// Bu kurallar yalnızca arayüz yönlendirmesidir: backend dozu planlanan
/// saate göre reddetmez ve uygulama zamanını daima kendi saatiyle damgalar.
class DoseTimingRules {
  DoseTimingRules._();

  /// Klinik sonucu henüz kaydedilmemiş durumlar. Backend'in
  /// RECORDABLE_STATUSES listesiyle aynıdır; `missed` dahildir, çünkü
  /// zamanlayıcının "kaçırıldı" saydığı bir doz geç de olsa verilebilir ve
  /// bu gerçek kayıt altına alınmalıdır.
  static const openStatuses = {'pending', 'notified', 'missed'};

  /// Planlanan saatten bu kadar sapma "zamanında" sayılır. Servis
  /// yoğunluğunda dakikası dakikasına uygulama beklenemez; tolerans
  /// dışındaki sapmalar engellenmez, yalnızca görünür kılınır.
  static const onTimeTolerance = Duration(minutes: 15);

  /// Planlanan saatten en fazla bu kadar önce "İlacı Ver" sunulur. Reçete
  /// günler sonrasının dozlarını da içerdiği için, pencere olmadan ertesi
  /// günün dozunu yanlışlıkla kapatmak mümkün olurdu.
  static const earlyWindow = Duration(minutes: 60);
}

/// Bir uygulama anının planlanan saate göre sapma türü.
enum DoseTimingKind { onTime, late, early }

/// Planlanan saat ile gerçek (veya şu anki) uygulama zamanı arasındaki fark.
class DoseTiming {
  const DoseTiming(this.kind, this.minutes);

  final DoseTimingKind kind;

  /// Mutlak sapma, dakika cinsinden.
  final int minutes;

  factory DoseTiming.between(DateTime scheduled, DateTime at) {
    final diff = at.difference(scheduled).inMinutes;
    final abs = diff.abs();
    if (abs <= DoseTimingRules.onTimeTolerance.inMinutes) {
      return DoseTiming(DoseTimingKind.onTime, abs);
    }
    return DoseTiming(
        diff > 0 ? DoseTimingKind.late : DoseTimingKind.early, abs);
  }

  /// "18 dk" / "1 sa 25 dk" biçimli süre.
  String get durationLabel {
    if (minutes < 60) return '$minutes dk';
    return '${minutes ~/ 60} sa ${minutes % 60} dk';
  }

  /// "Zamanında" / "18 dk geç" / "20 dk erken".
  String get label => switch (kind) {
        DoseTimingKind.onTime => 'Zamanında',
        DoseTimingKind.late => '$durationLabel geç',
        DoseTimingKind.early => '$durationLabel erken',
      };
}

/// Bir reçetenin tek bir planlanmış dozu, hasta dosyası görüntüsü için.
/// `GET /prescriptions/patient/:id` yanıtındaki `schedules[]` öğelerinden
/// üretilir; uygulanmış dozlarda gerçek uygulama zamanı ([administeredAt])
/// planlanan saatten ([scheduledTime]) ayrı tutulur, çünkü esnek akışta
/// ikisi kasıtlı olarak farklı olabilir ve denetimde ikisi de görünmelidir.
class DoseSlot {
  final String id;
  final DateTime scheduledTime;
  final String status;
  final DateTime? administeredAt;
  final String? administeredByName;

  /// Kayıt cihazdaki çevrimdışı kuyrukta, sunucuya henüz ulaşmadı.
  final bool syncPending;

  const DoseSlot({
    required this.id,
    required this.scheduledTime,
    required this.status,
    this.administeredAt,
    this.administeredByName,
    this.syncPending = false,
  });

  factory DoseSlot.fromJson(Map<String, dynamic> json) {
    final log = json['log'] as Map<String, dynamic>?;
    final nurse = log?['nurse'] as Map<String, dynamic>?;
    return DoseSlot(
      id: json['id'] as String,
      scheduledTime: DateTime.parse(json['scheduledTime'] as String).toLocal(),
      status: json['status'] as String,
      administeredAt: log == null
          ? null
          : DateTime.parse(log['performedAt'] as String).toLocal(),
      administeredByName: nurse?['fullName'] as String?,
    );
  }

  /// Dozun "Verildi" olarak kaydedilmiş yeni hali; ekran, listeyi yeniden
  /// çekmeden kartı anında güncellemek için kullanır.
  DoseSlot markAdministered({
    required DateTime at,
    String? byName,
    bool syncPending = false,
  }) =>
      DoseSlot(
        id: id,
        scheduledTime: scheduledTime,
        status: 'administered',
        administeredAt: at,
        administeredByName: byName,
        syncPending: syncPending,
      );

  /// Dozun "uygulanmadı" olarak kapatılmış hali (backend'de `skipped`).
  /// Hasta dosyası, sunucudan yeniden okumadan dozu açık dozlar arasından
  /// çıkarabilsin diye kullanılır.
  DoseSlot markNotAdministered({bool syncPending = false}) => DoseSlot(
        id: id,
        scheduledTime: scheduledTime,
        status: 'skipped',
        syncPending: syncPending,
      );

  bool get isOpen => DoseTimingRules.openStatuses.contains(status);

  bool get isAdministered => status == 'administered';

  /// Doz açık ve planlanan saati erken uygulama penceresine girmiş mi.
  bool isActionable(DateTime now) =>
      isOpen && scheduledTime.difference(now) <= DoseTimingRules.earlyWindow;

  /// Doz açık ve planlanan saati tolerans payından fazla geçmiş mi.
  bool isOverdue(DateTime now) =>
      isOpen &&
      DoseTiming.between(scheduledTime, now).kind == DoseTimingKind.late;

  /// Uygulanmış bir dozun planlanan saate göre sapması.
  DoseTiming? get administeredTiming => administeredAt == null
      ? null
      : DoseTiming.between(scheduledTime, administeredAt!);
}
