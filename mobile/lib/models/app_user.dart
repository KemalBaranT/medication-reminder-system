/// Oturum açmış personelin profili. `role`, sunucu tarafındaki yetkilendirmeyi
/// yansıtır; `title` (unvan/branş) yalnızca görüntüleme amaçlıdır ve
/// yetkilendirmeyi etkilemez.
class AppUser {
  final String id;
  final String fullName;
  final String? title;
  final String email;
  final String role;

  AppUser({
    required this.id,
    required this.fullName,
    this.title,
    required this.email,
    required this.role,
  });

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
        id: json['id'] as String,
        fullName: json['fullName'] as String,
        title: json['title'] as String?,
        email: json['email'] as String,
        role: json['role'] as String,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'fullName': fullName,
        'title': title,
        'email': email,
        'role': role,
      };

  /// "Dr. Mehmet Yılmaz - Genel Cerrah" gibi, unvan varsa ada ekleyen biçim.
  String get displayName =>
      (title == null || title!.isEmpty) ? fullName : '$fullName - $title';

  static const roleLabels = {
    'admin': 'Admin',
    'doctor': 'Doktor',
    'head_nurse': 'Başhemşire',
    'nurse': 'Hemşire',
    'secretary': 'Sekreter',
  };

  String get roleLabel => roleLabels[role] ?? role;

  /// Sistem genelinde tüm rol kısıtlamalarından muaf tutulan Super Admin
  /// rolü. Backend'deki `SUPER_ADMIN_ROLE` ile birebir aynı tutulmalıdır.
  static const superAdminRole = 'admin';

  /// **Super Admin geçersiz kılması (override):** Super Admin yetkisiyle
  /// oturum açıldığında, sistemi yönetmek, test etmek ve acil durumlarda her
  /// türlü veriyi düzeltebilmek amacıyla sistem genelindeki tüm güvenlik ve
  /// operasyon kısıtlamaları denetim amacıyla aşılır. Backend'deki
  /// `RolesGuard` aynı kuralı uygular; yapılan her işlem Super Admin'in
  /// kendi hesabıyla denetim kaydına geçer.
  bool get isSuperAdmin => role == superAdminRole;

  /// Uygulamadaki rol bazlı her görünürlük ve erişim kararının geçtiği tek
  /// kapı. Ekranlar rol karşılaştırmasını kendileri yapmaz; böylece yetki
  /// kuralı değiştiğinde istemcide güncellenecek tek yer burasıdır. Super
  /// Admin için verilen liste değerlendirilmez (bkz. [isSuperAdmin]).
  bool hasAnyRole(Iterable<String> roles) =>
      isSuperAdmin || roles.contains(role);

  /// Kullanıcının bir dozu "Verildi" / "Uygulanmadı" olarak kaydedip
  /// kaydedemeyeceği. Backend'deki `POST /administration-logs` guard'ıyla
  /// (`@Roles('nurse', 'head_nurse')` + Super Admin geçersiz kılması)
  /// birebir aynı tutulmalıdır.
  bool get canAdministerDoses => hasAnyRole(const ['nurse', 'head_nurse']);
}
