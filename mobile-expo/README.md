# İlaç Takip — Mobil Uygulama (React Native + Expo)

Hemşirelerin yatak başı ilaç uygulama istemcisi. Flutter tabanlı `mobile/`
uygulamasının yerini alan, Expo Go ile iOS ve Android'de doğrudan test
edilebilen React Native sürümüdür.

## Teknoloji

| Katman | Kütüphane |
| --- | --- |
| Çatı | Expo SDK 57, React Native 0.86, TypeScript (strict) |
| Yönlendirme | Expo Router (dosya tabanlı, `src/app/`) |
| Animasyon / Hareket | React Native Reanimated 4, React Native Gesture Handler |
| Kamera / Galeri | `expo-camera` (canlı barkod okuma + `scanFromURLAsync`), `expo-image-picker` |
| Ağ | Axios (JWT, sessiz token yenileme, UTF-8) |
| Bildirim | `expo-notifications` (yerel + push), `expo-background-task` |
| Güvenli depolama | `expo-secure-store` |
| İkonlar | `lucide-react-native` |

## Klasör yapısı

```
src/
  app/                    Ekranlar (Expo Router rotaları)
    _layout.tsx           Sağlayıcılar + oturuma göre korumalı rotalar
    login.tsx             Personel girişi
    (tabs)/_layout.tsx    Başlık + alt menü + "QR Tara" FAB kabuğu
    (tabs)/index.tsx      Bugünün İlaçları: arama, durum filtreleri, tekil kartlar
    (tabs)/patients.tsx   Hastalar listesi
    patient/[code].tsx    Hastanın günlük zaman çizelgesi
    scan/index.tsx        Bileklik tarayıcı (FAB) → hasta dosyası
    scan/[scheduleId].tsx Doza bağlı QR doğrulama (hasta + ilaç)
  notifications/          Kademeli bildirim politikası, yerel planlayıcı, arka plan senkronu
  api/                    Axios istemcisi, uç nokta kataloğu, adres çözümleme
  auth/                   Oturum, güvenli depolama, yetki kuralları (God Mode)
  domain/                 Tipler ve saf iş kuralları (aciliyet, iş listesi)
  state/                  İş listesi durumu (ScheduleProvider)
  components/             Kaydırılabilir kart, arama/filtre, alt menü, onay modalı, QR tarayıcı
  theme/                  Tasarım belirteçleri
```

## Kurulum ve çalıştırma

Ön koşullar: Node.js 20+, telefonda **Expo Go** uygulaması (App Store / Google Play),
telefon ile bilgisayarın **aynı Wi-Fi ağında** olması.

```bash
# 1) Backend'i başlatın (ayrı bir terminalde, repo kökünden)
docker compose up -d
cd backend
npm run start:dev

# 2) Mobil uygulama bağımlılıkları
cd mobile-expo
npm install

# 3) (İsteğe bağlı) Backend adresini sabitleyin
copy .env.example .env
#   EXPO_PUBLIC_API_URL=http://192.168.1.50:3000

# 4) Geliştirme sunucusunu başlatın
npx expo start
```

Terminalde çıkan QR kodu Android'de Expo Go ile, iOS'ta Kamera uygulamasıyla
okutun. Kurumsal ağlarda cihazlar birbirini göremiyorsa `npx expo start --tunnel`
kullanın (bu durumda `EXPO_PUBLIC_API_URL` ile backend adresini açıkça verin).

`EXPO_PUBLIC_API_URL` boş bırakılırsa uygulama, Expo geliştirme sunucusunun
çalıştığı bilgisayarın ağ adresini + `3000` portunu otomatik kullanır. Kullanılan
adres giriş ekranının altında görünür.

### Projeyi sıfırdan oluşturmak isterseniz

Bu klasör aşağıdaki komutlarla oluşturulmuştur:

```bash
npx create-expo-app@latest mobile-expo --template blank-typescript
cd mobile-expo
npx expo install expo-router react-native-safe-area-context react-native-screens \
  expo-linking expo-constants expo-status-bar react-native-reanimated \
  react-native-worklets react-native-gesture-handler expo-camera \
  expo-image-picker expo-secure-store expo-haptics react-native-svg
npm install lucide-react-native axios
```

Ardından `package.json` içinde `"main": "expo-router/entry"` ayarlanır ve
`app.json`'a `scheme` ile eklenti (plugin) yapılandırmaları eklenir.

## Test hesapları (seed)

| Rol | E-posta | Not |
| --- | --- | --- |
| Super Admin | `admin@hastane.test` | **God Mode**: tüm kısıtlamalar kalkar |
| Başhemşire | `bashemsire@hastane.test` | Doz kaydedebilir, servis genelini görür |
| Hemşire | `hemsire@hastane.test` | Kendi ve atanmamış dozlar |
| Doktor | `doktor@hastane.test` | Salt okunur (kaydırma eylemleri kilitli) |

Şifre: `Password123!`

## Kullanım

- **Ana ekran:** Her hasta için yalnızca en acil doz gösterilir (gecikmiş →
  saati gelmiş → bekleyen → tamamlanmış). Üstteki arama çubuğu hasta veya
  ilaç adına, hap filtreler (Tümü / Gecikti / Bekliyor / Verildi) duruma
  göre daraltır. Karta dokunmak hastanın günlük zaman çizelgesini açar.
- **QR Tara (sağ alttaki kırmızı düğme):** Hasta bilekliği okutulur ve
  hastanın günlük planı açılır.
- **Sağa kaydırma:** Manuel onay modalı. "Onayla" ile doz o anki saatle
  kaydedilir ve kart anında yeşile döner.
- **Sola kaydırma:** Gelişmiş QR Okuyucu. Önce hasta bilekliği, ardından
  (katalogda tanımlıysa) ilaç barkodu okutulur. Galeriden de okunabilir.
- **God Mode (Admin):** Arka planda çalışır; arayüzde yalnızca başlıktaki
  avatarın yanında küçük bir kalkan ikonu görünür. Saati gelmemiş dozlar
  ve yetki kilitleri açılır, QR ekranında "Doğrulamayı Atla" seçeneği
  çıkar. Tüm işlemler admin hesabıyla denetim kaydına geçer.

## Kademeli bildirimler (Escalation Alerts)

| Kademe | Ne zaman | Nasıl |
| --- | --- | --- |
| Hazırlık | Doz saatinden 15 dk önce | Sessiz bildirim (ses/titreşim yok) |
| Uygulama Zamanı | Tam doz saatinde | Kurumsal "chime" sesi (`assets/sounds/chime.wav`) |
| Gecikme (kritik) | Doz saatinden 30 dk sonra | Kırmızı, en yüksek öncelik, Android'de kaydırılarak kapatılamaz |

- Bildirime dokunmak hastanın günlük planını açar ve ilgili dozu vurgular.
- Doz kaydedildiği anda o doza ait bekleyen bildirimler iptal edilir, ekrandaki
  kritik uyarı kalkar.
- Bildirimler cihazda yerel olarak planlanır; bağlantı kopsa da tam saatinde gelir.
  Plan; ön planda, en az 15 dakikada bir arka plan görevinde ve (development/production
  build'de) sunucunun sessiz senkron sinyaliyle güncellenir.
- 30. dakikada backend dozu "kaçırıldı" yapar ve başhemşirelere sunucu kaynaklı
  kritik uyarı gönderir.

**Expo Go kısıtları:** Yerel bildirimler ve arka plan görevi Expo Go'da çalışır.
Özel "chime" sesi ve uzak (push) bildirimler ise development build gerektirir
(`npx expo run:android` / `npx expo run:ios` veya `eas build --profile development`).
Expo Go'da varsayılan sistem sesi çalar. Uzak bildirim için `npx eas-cli init` ile
EAS proje kimliği oluşturulmalıdır.

**Hızlı test:** Web panelinden bir hastaya 20 dakika sonrası için doz planlayın,
mobilde listeyi yenileyin. 5. dakikada "Hazırlık", 20. dakikada sesli "Uygulama
Zamanı", 50. dakikada kalıcı kırmızı uyarı gelir.

## Doğrulama komutları

```bash
npx tsc --noEmit     # tip denetimi
npx expo-doctor      # bağımlılık / yapılandırma denetimi
```
