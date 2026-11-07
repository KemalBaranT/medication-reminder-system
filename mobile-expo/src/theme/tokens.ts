/**
 * Uygulamanın tek tasarım dili kaynağı.
 *
 * Değerler, önceki Flutter istemcisinin Material 3 temasıyla (tohum rengi
 * #C8102E, web panelinin "Medical Point" kurumsal kırmızısı) birebir
 * eşleşir; kullanıcılar iki sürüm arasında görsel bir fark görmemelidir.
 * Marka kırmızısı arka planlara değil, başlık ve FAB gibi vurgu öğelerine
 * uygulanır; zeminler beyaz/açık gri kalır.
 *
 * Klinik durum renkleri anlamsaldır: kırmızı yalnızca "gecikti", turuncu
 * "bekliyor", yeşil "verildi" anlamına gelir. Marka rengi kırmızı olduğu
 * için nötr vurgular (ör. "Tümü" filtresi, gecikmemiş dozlar) grafit
 * tonuyla gösterilir; aksi halde "Gecikti" ile ayırt edilemezdi.
 */
export const palette = {
  background: '#F4F6FA',
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAFC',
  border: '#E7D6D4',
  text: '#1F1A1A',
  textMuted: '#534341',
  textSubtle: '#857371',

  primary: '#B3182F',
  onPrimary: '#FFFFFF',
  primaryContainer: '#FFDAD8',
  secondaryContainer: '#F7DCD9',
  onSecondaryContainer: '#2C1513',
  errorContainer: '#FFDAD6',
  onErrorContainer: '#410002',

  neutralAccent: '#546E7A',
  overdue: '#E53935',
  overdueSoft: '#FDECEA',
  overdueBorder: '#EF9A9A',
  overdueText: '#D32F2F',
  due: '#F57C00',
  dueSoft: '#FFF3E0',
  upcoming: '#546E7A',
  upcomingSoft: '#ECEFF1',
  done: '#43A047',
  doneSoft: '#E8F5E9',
  doneBorder: '#A5D6A7',
  doneText: '#388E3C',

  noteBackground: '#FFF8E1',
  noteBorder: '#FFE082',
  noteIcon: '#FF8F00',
  noteText: '#FF6F00',

  swipeConfirm: '#2E7D32',
  swipeQr: '#37474F',
  swipeLocked: '#9E9E9E',

  godMode: '#7C3AED',

  scannerBackdrop: 'rgba(3, 7, 18, 0.72)',
  laserIdle: '#22C55E',
  laserError: '#EF4444',
  white: '#FFFFFF',
  black: '#000000',
} as const;

/** 4 pt tabanlı boşluk ölçeği; tüm kenar boşlukları bu adımlardan seçilir. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

export const typography = {
  title: { fontSize: 18, fontWeight: '700' as const },
  heading: { fontSize: 15.5, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  label: { fontSize: 12.5, fontWeight: '700' as const },
  caption: { fontSize: 12, fontWeight: '500' as const },
} as const;

export const shadow = {
  /**
   * Liste kartlarının zemin gölgesi. Kenarlık kartın sınırını çizer, bu
   * çok düşük opaklıklı ve kısa gölge yalnızca derinlik hissi verir; kart
   * düz görünümünü korur, "yüzen" bir öğeye dönüşmez.
   */
  card: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  /** Arama çubuğunun "yüzen" görünümü için yumuşak gölge. */
  floating: {
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  fab: {
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
} as const;

/** Alt menünün içerik yüksekliği (güvenli alan hariç). */
export const TAB_BAR_HEIGHT = 66;
