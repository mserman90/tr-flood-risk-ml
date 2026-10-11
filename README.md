# TR-TaşkınRisk ML: Türkiye Çok Ölçekli Taşkın Risk İndeksi Sınıflandırma ve Mekânsal Doğrulama Platformu

Bu proje, **Holger Manuel Benavides-Muñoz & Leirys María Benavides-Ortega (2026)** tarafından *Water* (MDPI, Cilt 18, Sayı 20, Makale 2515, DOI: `10.3390/w18202515`) dergisinde yayımlanan **"Machine Learning Models for Flood-Risk Index Classification: A Comparative Evaluation with Multi-Scale Spatial Replication Using the FEMA National Risk Index"** makalesinin metodolojisini **Türkiye (81 İl, 7 Coğrafi Bölge ve 25 DSİ Nehir Havzası)** için interaktif bir karar destek ve mekânsal doğrulama web uygulamasına dönüştürür.

## Canlı Uygulama (GitHub Pages)
🔗 **Canlı Bağlantı:** [https://mserman90.github.io/tr-flood-risk-ml/](https://mserman90.github.io/tr-flood-risk-ml/)

## Özellikler ve Modüller

1. **Türkiye 81 İl Risk Haritası & Maruziyet-Büyüklük Karıştırıcı Tanısı (Aşama II–III):**
   - Ham TL beklenen taşkın kaybının il nüfusuyla gösterdiği yüksek korelasyon ($r \approx 0.63$) ile **Maruziyet Başına Tarihsel Kayıp Oranı (`HLRR` / `FloodRiskHigh`)** ($r \approx -0.03$) arasındaki farkı 81 il üzerinde canlı olarak karşılaştırır.
2. **Canlı Havza / İlçe 20-Gösterge & 6-ML Sınıflandırıcı Simülatörü (Aşama I):**
   - 4 fonksiyonel alandaki 20 ordinal bileşik gösterge ($[0, 19]$ tam sayı ölçeği) üzerinden **Logistic Regression, CatBoost, LightGBM, Gradient Boosting, Random Forest ve Decision Tree** modellerini anlık çalıştırır.
   - Karar eşiği ($\tau \in [0.10, 0.90]$) duyarlılık analizi, Platt ölçekleme (post-hoc recalibration), Güvenilirlik Diyagramı (Brier skoru) ve SCS-CN yüzeysel akış vekil hesaplamalarını içerir.
3. **Mekânsal Bölgeler Arası Çapraz Doğrulama (LORO-CV) Laboratuvarı:**
   - Türkiye'nin 7 coğrafi bölgesini sırayla eğitim dışı bırakarak (*Leave-One-Region-Out Cross-Validation*), rastgele 70/30 bölmenin mekânsal transfer edilebilirliği nasıl abarttığını ve ince ölçekte Lojistik Regresyonun eğitilmemiş bölgelere nasıl daha dirençli transfer olduğunu gösterir.
4. **Kendi Verini Test Et (CSV) & JSON Analiz Raporu:**
   - Özel havza/il/ilçe CSV dosyalarını tarayıcı içinde toplu olarak sınıflandırır ve detaylı JSON raporu üretir.
