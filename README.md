# Ilac Hatirlatma ve Takip Sistemi

Uc parcadan olusur:

- `backend/` - NestJS + PostgreSQL (Prisma) + Redis/BullMQ + Firebase Cloud Messaging
- `web/` - React + Vite + TypeScript yonetim paneli (Doktor / Bashemsire / Sekreter)
- `mobile/` - Flutter mobil uygulama (Hemsire)

## 1. Gereksinimler

- Node.js 20+ (kurulu: bu makinede mevcut)
- Docker Desktop (PostgreSQL + Redis'i konteynerde calistirmak icin, en kolay yol) **veya** PostgreSQL 16 + Redis'in ayri ayri native kurulumu
- Flutter SDK (mobil gelistirme icin - https://docs.flutter.dev/get-started/install/windows)
- Bir Firebase projesi (push bildirim icin - https://console.firebase.google.com)

Bu makinede su an Docker, PostgreSQL ve Flutter kurulu degil; asagidaki adimlar bunlarin kurulumunu da kapsiyor.

## 2. Backend'i calistirma

```bash
# 1) Postgres + Redis'i ayaga kaldirin (Docker Desktop kurulduktan sonra)
docker compose up -d

# 2) Backend bagimliliklari (zaten kuruldu, degisiklik sonrasi tekrar gerekirse)
cd backend
npm install

# 3) .env dosyasini olusturun
copy .env.example .env
# JWT_SECRET'i uzun rastgele bir deger ile degistirin
# Firebase servis hesabi bilgilerini FIREBASE_* alanlarina girin

# 4) Veritabani semasini uygulayin
npm run prisma:migrate

# 5) Test verisi ekleyin (3 kullanici + 1 hasta + 1 ilac, sifre: Password123!)
npm run prisma:seed

# 6) Sunucuyu baslatin
npm run start:dev
```

Backend `http://localhost:3000` adresinde ayaga kalkar.

### Firebase servis hesabi nasil alinir
Firebase Console > Proje Ayarlari > Servis Hesaplari > "Yeni Ozel Anahtar Olustur". Inen JSON dosyasindaki `project_id`, `client_email`, `private_key` degerlerini `.env` dosyasina yapistirin (private_key'deki `\n` karakterlerini oldugu gibi birakin).

## 3. Web panelini calistirma

```bash
cd web
copy .env.example .env
npm run dev
```

`http://localhost:5173` adresinde acilir. Seed sonrasi giris bilgileri:
- Bashemsire: bashemsire@hastane.test / Password123!
- Doktor: doktor@hastane.test / Password123!
- Hemsire (raporlarda gorunur, mobilden giris yapar): hemsire@hastane.test / Password123!

## 4. Mobil uygulamayi calistirma

`mobile/` klasorunde `lib/` ve `pubspec.yaml` hazir; ancak bu makinede Flutter SDK kurulu olmadigi icin `android/` ve `ios/` platform klasorleri henuz olusturulmadi. Flutter SDK'yi kurduktan sonra:

```bash
cd mobile
flutter create .   # eksik android/ios platform klasorlerini ekler, lib/ ve pubspec.yaml'a dokunmaz
flutter pub get
flutterfire configure   # Firebase projenizi baglar, firebase_options.dart olusturur (flutterfire_cli gerekir)
flutter run --dart-define=API_URL=http://10.0.2.2:3000
```

`firebase_options.dart` olustuktan sonra `lib/main.dart` icindeki `Firebase.initializeApp()` cagrisina `options: DefaultFirebaseOptions.currentPlatform` eklenmelidir (flutterfire configure bunu otomatik onerir).

## 5. Mimari ve is akisi ozetleri

Ayrintili sistem mimarisi, veritabani semasi ve bildirim algoritmasi acaiklamasi bu projeyi olusturan sohbet gecmisinde mevcuttur. Ozetle:

- **Neden Node.js + PostgreSQL (Firebase Firestore degil):** raporlama sorgulari (kim hangi ilaci ne zaman geciktirdi) icin iliskisel JOIN/GROUP BY gerekiyor; FCM zaten backend secimimizden bagimsiz olarak kullanilabiliyor.
- **Bildirim algoritmasi:** her gece calisan bir uretici (`ScheduleService.generateForAllActivePrescriptions`) aktif receteler icin sonraki 48 saatin doz zamanlarini `administration_schedule` tablosuna yazar; her satir icin BullMQ'ya tam zamaninda tetiklenecek gecikmeli bir is eklenir (`schedule.service.ts`, `schedule.processor.ts`). Is tetiklendiginde FCM data-mesaji gonderilir, N dakika icinde geri bildirim gelmezse bashemsireye eskalasyon bildirimi gider ve doz "kacirildi" olarak isaretlenir.
