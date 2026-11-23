# Muallimun Kur'an, Meal & Araştırma Platformu (`kuran.muallimun.net`)

Kur'an talebeleri, hafızlık öğrencileri, öğretmenler ve tüm okuyucular için geliştirilen; **Mushaf & 27 Meal/Tefsir Okuma**, **Renkli Tecvit ve Kelime Takipli (Karaoke) 28 Kurrâ Tilaveti**, **601 Konulu Fihrist & Nüzul Kronolojisi**, **Klasik 20/24 Tur Hafızlık & Ezber Modu**, **30 Cüz Hatim Planlayıcısı**, **Sınav Merkezi (A4 A/B Kitapçık Üretici)** ve **7 Eğitsel Oyun** içeren çevrimdışı uyumlu PWA platformu.

## Temel Modüller & Veri Mimarisi (`public/data`)
- **114 Sure / 30 Cüz / 604 Mushaf Sayfası / 6.236 Ayet** parçalı (sharded) JSON yapısı
- **27 Meal & Tefsir**: Resmî Diyanet (TDV, DİB Yeni, Kur'an Yolu, DİB Eski), Klasik, Çağdaş & Akademik mealler, Arapça tefsirler (*el-Müyesser*, *el-Celâleyn*) ve İngilizce (*Saheeh International*)
- **28 Kurrâ Tilaveti & Sesli Meal**: Kelime-kelime senkronizasyon, secde/vakıf işaretleri, sesli çalma listeleri ve Sunum Modu
- **77.429 Kelime**: Kelime-kelime Arapça ↔ Türkçe anlam verisi ve müteşâbihât (benzer ayetler) bağlantıları
- **Fihrist & Araştırma**: 601 konulu fihrist, nüzul kronolojisi, kişisel ayet notları ve araştırma defterleri
- **Ezber & Hafızlık + 30 Cüz Hatim**: Klasik 20/24 tur Ham–Has hafızlık planlayıcısı, Zen ezber oturumu ve hatim takip sistemi
- **Sınav Merkezi & 7 Eğitsel Oyun**: Sure bazlı doğrulanmış soru bankası (`q/`), Hata Kampı, A4 yazılı sınav üretici ve 7 etkileşimli oyun
- **Çevrimdışı PWA & Tam Yedekleme**: Tek tıkla çevrimdışı paket indirme, tüm çalışma verileri için JSON yedekleme/taşıma ve sunucu köprülü `/api/feedback` iletişim sistemi
