# Muallimun Kur'an & Meal (`meal.muallimun.net`)

Gençler ve çocuklar başta olmak üzere tüm Kur'an talebeleri için geliştirilen; **Mushaf & Çift Meal (TDV / DİB) Okuma**, **Ayet ve Kelime Dinleme**, **Etkileşimli Meal Yarışması** ve **A/B Kitapçıklı A4 PDF Sınav Üretici** PWA platformu.

## Veri Mimarisi (`public/data`)
- **114 Sure / 30 Cüz / 6.236 Ayet** parçalı (sharded) JSON yapısı
- **77.429 Kelime** kelime-kelime Arapça ↔ Türkçe anlam verisi
- **Çift Meal & Dipnotlar**: Diyanet Vakfı Meali (`m1`) ve Diyanet İşleri Meali (`m2`)
- **Soru Bankası (`q/`)**: Sure bazlı doğrulanmış ve şık dengesi sağlanmış çoktan seçmeli sorular
