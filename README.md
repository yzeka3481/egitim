# Gezi Planlayıcı (PWA)

Bu proje, tarayıcı üzerinden açılan ve **Ana Ekrana eklenebilen** (PWA) bir “KML tabanlı gezi planlayıcı”dır.

## Kurulum (GitHub Pages ile ücretsiz yayınlama)
1. GitHub’da yeni bir repo oluşturun (örnek isim: `gezi-planlayici`).
2. Bu zip’in içindeki dosyaları repo kök dizinine yükleyin (index.html, manifest.webmanifest, sw.js, icons klasörü).
3. Repo -> **Settings** -> **Pages**
   - **Build and deployment**: “Deploy from a branch”
   - Branch: `main` / Folder: `/ (root)`
4. GitHub Pages size bir URL verir. O URL’i telefonda **Safari/Chrome** ile açın.

## Telefona “Uygulama” gibi ekleme
### iPhone (iOS)
- Safari’de sayfayı açın -> **Paylaş** -> **Ana Ekrana Ekle**

### Android
- Chrome’da sayfayı açın -> menü -> **Uygulamayı yükle** / **Ana ekrana ekle**

## Notlar
- Dosya seçimi ve PWA özellikleri için sayfanın **HTTPS** ile açılması gerekir (GitHub Pages bunu sağlar).
- Km/Dk hesabı internet varsa OSRM ile daha doğru; internet yoksa yaklaşık offline hesap kullanır.
