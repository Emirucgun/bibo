# SCOPE — Kaynak v1 kapsamı

| | |
| --- | --- |
| Sürüm | v1 (MVP / pilot) · 10 Kasım 2026 · rev. 2 |
| Amaç | 50 kişilik, 2 aylık ücretsiz pilotu başlatmak için gereken en küçük ürün |
| Bağlı belgeler | Özellik kimlikleri (F1–F14) `PRD.md`'den, teknik ayrıntı `SPEC.md`'den |

---

## 1. Bu dosya nasıl kullanılır

Bitiriş aşamasında karar vermenin tek ölçüsü bu dosyadır.

1. **Burada olmayan v1'e girmez.** Yeni fikir geldiğinde tartışmayın; tarihiyle Bölüm 5'teki v2 havuzuna yazın.
2. **Önce M, sonra S.** "Olmazsa olmaz" maddelerin hepsi bitmeden "olmalı" maddelerine başlanmaz.
3. **Süre taşarsa kesme sırası uygulanır** (Bölüm 3). Kesilen madde silinmez, v2 havuzuna taşınır.
4. **Kapsam değişirse günlüğe yazılır** (Bölüm 6). İki kişiden biri itiraz ederse değişiklik yapılmaz.

### "v1 bitti" tanımı

Aşağıdakilerin **hepsi** doğruysa v1 biter ve pilot başlar:

- [ ] Bölüm 2'deki tüm M maddeleri işaretli.
- [ ] Değerlendirme eşikleri geçti: üretim şema geçerliliği %100, ortalama ≤ 0,02 $/oturum, etiketleme uyumu ≥ %80, transkript sadakati ≥ %85, simülasyonda 5. oturumda teşhis.
- [ ] Gecikme eşikleri geçti: yapay zekâ değerlendirmesi p90 ≤ 6 sn, sonraki oturumun üretimi p90 ≤ 60 sn.
- [ ] RLS testi geçti; cevap anahtarı istemciye sızmıyor.
- [ ] iOS Safari ve Android Chrome cihaz kontrol listesi tamam.
- [ ] Aydınlatma metni yayında; yurt dışı aktarım konusunda hukuki görüş alındı.
- [ ] Sağlayıcı harcama limitleri tanımlı (Anthropic Console, Azure bütçe uyarısı) ve uygulama içi tavan test edildi.
- [ ] Ekip + en az 3 dış kişi 3 gün boyunca uygulamayı kesintisiz kullandı.

---

## 2. v1 — Olmazsa olmaz (M)

### Giriş ve başlangıç

- [ ] **F1** Google ile giriş (Supabase Auth)
- [ ] **F1** Davet kodu, kohort kapasitesi (60), davetsiz erişimin engellenmesi
- [ ] **F1** 18+ beyanı, KVKK aydınlatma ve açık rıza (sürüm + zaman kaydı)
- [ ] **F2** Seviye beyanı (A1 / A2 / emin değilim), en az 2 ilgi alanı (12 seçenek)
- [ ] **F2** 14 soruluk sabit yerleştirme testi ve ustalık tohumlama
- [ ] **F2** "Tahmini zayıf noktalar" kartı (3 konu, "tahmin" etiketli)

### Öğrenme döngüsü

- [ ] **F3** Planlayıcı: tekrar, odak, çapraz tekrar, kapsama, germe; 8–10 etkinlik, 900–1200 sn, dört beceri; seslendirme kapalıyken dinleme slotlarını metne düşürme
- [ ] **F3** Tek çağrıda oturum üretimi (Claude Haiku 5.5, `effort = medium`) + kod kontrolleri + slot düzeyinde yeniden üretim
- [ ] **F3** Oturumun önceden hazırlanması (`after()`, p90 ≤ 60 sn), hazır oturumun ≤ 2 sn açılması
- [ ] **F3** Sekiz etkinlik türünün arayüzü: oku-seç, boşluk doldur, cümle diz, dinle-seç, dikte, çevir, kısa yaz, sesli cevapla
- [ ] **F3** Kaldığı yerden devam (24 saat), kişi başı günlük oturum sınırı
- [ ] **F3** İçeriğin %20'si genel (ilgi alanı etkisini ölçmek için), işaretli
- [ ] **F4** Kısa Türkçe geri bildirim, doğru biçim, L1 karşılaştırması
- [ ] **F4** "Daha fazla açıkla" (ek çağrı yok) ve açıklama modu öğrenimi
- [ ] **F4** Türkçe ipucu, ipuçlu cevabın en fazla 0,5 sayılması
- [ ] **F5** Bulut TTS (Speechify Simba 3.5), önbellek, imzalı URL, A1 hızı 0,9 (SSML), en çok 3 dinleme
- [ ] **F5** Seslendirme kotası takibi (%80 uyarısı), servis yanıt vermezse oturumun kırılmaması
- [ ] **F6** Bas-konuş WAV kaydı (16 kHz mono, ≤ 45 sn), ses saklanmaz
- [ ] **F6** İki adımlı transkript (Azure MAI-Transcribe-2, `verbatim`) + değerlendirme (Claude), transkriptin gösterilmesi, 1 yeniden kayıt hakkı
- [ ] **F7** Hata etiketleme (çeldirici kodu, kural, yapay zekâ), `error_events`
- [ ] **F7** Kademeli ustalık puanı, aralıklı tekrar, yan kanıt
- [ ] **F7** Teşhis kuralları (beceri eksiği, konu eksiği, etkinlik uyumsuzluğu), güven eşiği 0,6
- [ ] **F7** Etkinlik verimi verisinin toplanması (`activity_stats`)
- [ ] **F8** Oturum özeti, kanıtlı teşhis kartı, "Doğru / Bence değil", 1–5 puan ve not

### Ölçüm, güvenlik ve işletim

- [ ] **F11** Öğretmen inceleme kuyruğu (%15 örneklem), karar kaydı, haftalık uyum yüzdesi
- [ ] **F12** `llm_usage` günlüğü (sağlayıcı, önbellek tokenları, TTS karakteri), aylık bütçe tavanı (seslendirme plan ücreti dahil), acil durdurma, günlük sınır
- [ ] **F12** Yönetim özeti: kayıtlı/aktif kullanıcı, haftada ≥ 4 oturum oranı, W4, ay içi maliyet, ay içi seslendirme karakteri
- [ ] **F13** Verimi indir (JSON), hesabımı sil (zincirleme silme)
- [ ] Gizlilik sayfası (aydınlatma metni)
- [ ] Günlük cron işi (eski oturumlar, TTS temizliği, maliyet özeti)
- [ ] Değerlendirme betikleri: `eval-generation`, `eval-tagging`, `eval-verbatim`, `simulate` (gecikme ölçümü dahil)

### İçerik (pedagoji)

- [ ] 32 konu (Ek A) doğrulandı
- [ ] 24 hata kodu (Ek B) doğrulandı, her birine örnek eklendi
- [ ] 14 yerleştirme sorusu yazıldı
- [ ] Açıklama stil rehberi (1 sayfa)
- [ ] 40 cümlelik altın etiket seti
- [ ] 20 bilerek hatalı okunmuş ses kaydı (transkript testi)
- [ ] Seslendirme sesi seçildi (Speechify en-US, 2–3 aday arasından)

---

## 3. v1 — Olmalı (S) ve kesme sırası

Süre taşarsa **yukarıdan aşağıya** kesilir. Kesilen maddenin yerine geçen en ucuz çözüm sağdadır.

| Sıra | Madde | Kesilirse yerine |
| --- | --- | --- |
| 1 | **F14** PWA (ana ekrana ekle) | Tarayıcı yer imi; WhatsApp grubunda link |
| 2 | Yönetim panelinde grafikler | Aynı ölçütler tablo olarak ya da kayıtlı SQL sorgularıyla |
| 3 | **F9** İlerleme ekranı | Ana sayfada tek satır: "Bu hafta 3 oturum · en sık hatan: üçüncü tekil -s" |
| 4 | **F10** Haftalık okul konusu | Pilotun 2. haftasında eklenir |
| 5 | Etkinlik verimine göre tür seçimi (ε-greedy) | Rastgele tür seçimi; veri yine toplanır, analiz pilot sonunda yapılır |
| 6 | Teşhis "çözüldü" kartı | Yalnızca aktif teşhis gösterilir |

**Asla kesilmeyenler:** teşhis motoru, öğretmen inceleme kuyruğu, maliyet koruması, KVKK maddeleri, hesap silme. Bunlar olmadan pilot ya ölçüm yapamaz ya da güvenli değildir.

---

## 4. Açıkça kapsam dışı (v1'de yok)

| Madde | Neden v1'de yok |
| --- | --- |
| Uygulama içi ödeme, abonelik, planlar | Pilot ücretsiz; ödeme isteği pilot sonunda manuel ön ödemeyle ölçülür |
| Gerçek zamanlı sesli sohbet | Maliyetin en büyük kalemi; rakiplerdeki söz kesme şikâyetinin kaynağı. Bas-konuş yeterli |
| Telaffuz puanlaması (fonem düzeyi) | Pahalı ve aksanı cezalandırma riski taşıyor; v1 yalnızca algıyı (dinleme) ölçer |
| Serbest sohbet botu ("benimle konuş") | ChatGPT ile ham sohbette yarışmak hedef değil; teşhise veri üretmiyor |
| Yerel iOS / Android uygulaması | Mağaza ücretleri ve inceleme süresi; PWA yeterli |
| Bildirim (push, e-posta, SMS) | Pilotta WhatsApp grubu; maliyet ve geliştirme süresi sıfır |
| Seri, rozet, liderlik tablosu, puan ekonomisi | "Manipülasyon yok" ilkesi; ayrıca kullanım ölçümünü kirletir |
| A1–A2 dışındaki seviyeler | Teşhis modeli önce dar kitlede kanıtlanmalı |
| 18 yaş altı kullanıcılar | KVKK ve rıza yükü; hedef kitle dışında |
| Anadili Türkçe olmayanlar, İngilizce dışı diller | Savunma Türkçe L1 bilgisine dayanıyor |
| Okul ve öğretmen hesapları, sınıf yönetimi | Doğrudan öğrenciye satış modeli; okullarla anlaşma yok |
| Okul müfredatına birebir uyum | Haftalık okul konusu seçimi yeterli |
| Aile veya üniversiteye satış | İş modeli kararı: önce öğrenci öder |
| Kendi anahtarını getir (BYOK) | Hedef kullanıcının teknik bilgisi düşük; maliyet kontrolü ve destek yükü artar. **Karar: v2'ye de alınmıyor**, yeniden açılması için gerekçe gerekir |
| E-posta veya Apple ile giriş | Pilot kitlesi için Google yeterli; e-posta altyapısı ek iş ve maliyet |
| Kelime bilgisi teşhisi | Teşhis kapsamı dilbilgisi + 2 sesletim algısı konusu ile sınırlı |
| Ses kaydının saklanması | Veri asgarisi; transkript yeterli |
| Çevrimdışı kullanım | İçerik üretimi ve değerlendirme sunucuda |
| Ayrı hata izleme servisi | Vercel günlükleri ve yönetim paneli yeterli |
| Uzun ders anlatımı, video içerik | Ürün pratik ve teşhis odaklı |
| İngilizce dışında arayüz dili | Yalnızca Türkçe |
| Birden fazla seslendirme sağlayıcısı arasında otomatik geçiş | Pilot ölçeğinde gereksiz karmaşıklık; kota dolarsa dinleme geçici olarak kapanır |

---

## 5. v2 havuzu

Öncelik pilot sonuçlarına göre yeniden sıralanır. "Tetik" sütunu, maddenin ne zaman masaya geleceğini söyler. Ücretli döneme ait sayılar finans tablosundandır (10 Kasım 2026 varsayımları).

### Öncelik 1 — Pilot başarılıysa ilk iş

| Madde | Neden | Tetik |
| --- | --- | --- |
| Ödeme altyapısı (TL tahsilat yapabilen yerel bir ödeme sağlayıcısı; finans modeli PayTR varsayar: %2,19 komisyon, kurulum ücreti yok, kayıtlı kartla tekrarlayan ödeme) + Ücretsiz / Plus / Pro | Gelir modeli | Fiyat testi eşiği geçti (≥ 10 ön ödeme) |
| Paket tanımları (finans modeli varsayımı: Ücretsiz ayda 8 oturum, Plus 30, Pro 60; önerilen fiyat Plus 149,99 TL, Pro 249,99 TL) | Ücretsiz kullanıcı yükü başabaşı belirliyor | Fiyat testi |
| Barındırma kararı: Vercel Pro (20 $/ay) + Supabase Pro (25 $/ay) ya da ticari kullanıma izin veren daha ucuz bir seçenek | Vercel Hobby ticari kullanıma izin vermiyor | Ücret alma kararı |
| Hukuki yapı (şirket ya da şahıs işletmesi), mali müşavir (tahmin ≈ 3.000 TL/ay; teklif alınmalı), KVKK süreçlerinin kalıcı hâle getirilmesi | Ücret almak ve veri sorumluluğu. Ücretli dönemde aylık sabit gider ≈ 5.300 TL'nin yarısından fazlası bu kalem | Ücret alma kararı |
| Dönem / kur bazlı fiyatlandırma | Hazırlık bir yıl sürer; yıllık indirim planı tam ayrılma noktasında gelir bekliyor | Fiyat testi |
| Hatırlatma bildirimleri (web push veya e-posta) | Alışkanlık | Haftada ≥ 4 oturum oranı < %50 |
| İlgi alanı etkisi raporu (ilgi alanlı ve genel içerikte tamamlama oranı) | Varsayımı doğrular veya çürütür; veri v1'de toplanıyor | Pilotun 4. haftası |
| Etiketleme modelinin yükseltilmesi veya ince ayar verisi | Teşhis kalitesi | Uyum < %80 |
| Seslendirme planının büyütülmesi (Speechify Starter → Pro) | Starter 1,9M karakter/ay içerir; üstünde aşım 10 $/1M | Aylık karakter ≈ 1,9M'yi aşınca |
| Oturum üretiminin Batch API'ye taşınması (%50 indirim) | Üretim gecikmeye duyarlı değil; ölçekte maliyet yarıya iner | Aylık yapay zekâ maliyeti > 100 $ |

### Öncelik 2 — Ürünü derinleştirme

| Madde | Neden |
| --- | --- |
| Aksana saygılı telaffuz geri bildirimi (anlaşılırlık ve aksan ayrı puan; th, w/v üretimi) | Rakip analizindeki 3. ayrışma fırsatı |
| Hata bulma ve sesli okuma etkinlikleri | Etkinlik çeşitliliği, verim ölçümü için daha çok veri |
| Kelime bilgisi teşhisi ve kelime tekrar kartları | Hazırlık sınavlarında ağırlıklı |
| Bas-konuş ile rol yapma senaryoları | Konuşma becerisine daha fazla kanıt |
| Arkadaş daveti (çevre etkisiyle yayılma) | İş modelindeki yayılma varsayımı |
| İlerlemeyi paylaşma (öğretmen, arkadaş) | Motivasyon ve yayılma |
| Hazırlık programlarının haftalık konu sıralarıyla eşleme | "Okulda görmediğim şey" şikâyeti |
| Tahmini kur sınavı hazırlık raporu | Acil ihtiyaç (kur geçmek) ile bağ |

### Öncelik 3 — Genişleme

| Madde | Neden |
| --- | --- |
| B1 ve üstü seviyeler | Kullanıcının hazırlıktan sonra kalması |
| İş arayan / çalışan yetişkin segmenti | Gelecek halka |
| Yerel mobil uygulama | Bildirim ve mikrofon deneyimi |
| Gerçek zamanlı sesli sohbet | Maliyet düşerse |
| Üniversite / kurum paneli | İş modeli değişirse |
| Çevrimdışı mod | |

### Yeni fikirler (tarihle ekleyin)

| Tarih | Fikir | Kim | Not |
| --- | --- | --- | --- |
| | | | |

---

## 6. Kapsam değişiklik günlüğü

| Tarih | Değişiklik | Neden | Karar veren |
| --- | --- | --- | --- |
| 10.11.2026 | İlk sürüm | — | Ekip |
| 10.11.2026 | Model yığını: Gemini 3.1 Flash-Lite (üretim, değerlendirme, transkript) + Google Chirp 3: HD → Claude Haiku 5.5 (üretim `medium`, değerlendirme `low`) + Azure MAI-Transcribe-2 + Speechify Simba 3.5 | Artificial Analysis karşılaştırması: dört alanda da daha yüksek kalite, oturum başı yapay zekâ maliyeti 0,0176 $ → 0,0118 $; Gemini 3.1 Flash-Lite kullanımdan kalkıyor | Ekip (finans tablosu, Model Seçimi sayfası) |
| 10.11.2026 | F8: sonraki oturumun hazır olma süresi 30 sn → 60 sn | Seçilen model düşünme ile ≈ 8.500 çıktı tokenı üretiyor; günde en çok 2 oturum olduğundan kullanıcıya görünmüyor | Ekip |
| 10.11.2026 | F5: seslendirme kotası dolarsa ya da servis yanıt vermezse dinleme slotlarının metne düşmesi | Speechify ücretsiz planı kota dolunca isteği reddediyor | Ekip |
