# M5 pedagoji görevleri

İki görev var. İkisi de bitince yapay zekâ katmanı (M5) tamamlanmış sayılır ve oturum ekranına (M6) geçilir.

| # | Görev | Süre (tahmini) | Teslim |
| --- | --- | --- | --- |
| 1 | Yapay zekânın ürettiği 20 etkinliği incele | 1 saat | `review-sample.md` (işaretlenmiş) |
| 2 | 40 cümlelik "altın set" hazırla | 3–4 saat | `altin-set-sablon.csv` (doldurulmuş) |

---

## Görev 1 — 20 etkinliği incele

### Ne yapacaksın?

Sana `review-sample.md` adlı bir dosya geliyor. İçinde yapay zekânın ürettiği oturumlardan rastgele seçilmiş 20 etkinlik var. Her birinin "uygun" olup olmadığına karar vereceksin.

### Ne işe yarayacak?

Yapay zekânın her gün öğrencilere hazırlayacağı etkinliklerin kalitesini ölçmek için kullanılacak. **20 etkinlikten en az 18'i uygun çıkmalı.** Daha az çıkarsa komutları senin notlarına göre düzeltir ve yeniden üretiriz.

### Bir etkinliği nasıl okursun?

Her etkinliğin başlığında etkinlik türü, konu ve seviye yazar. Örnek: `gap_fill · g.present_perfect · A2`. Altındaki kutuda iki bölüm var:

- **`payload`**: Öğrencinin ekranda gördüğü kısım.
  - `instruction_tr`: Yönerge.
  - `text_en`: Cümle ya da metin.
  - `question_en`: Soru.
  - `options`: Şıklar.
  - `tokens`: Sıralanacak kelimeler.
  - `source_tr`: Çevrilecek Türkçe cümle.
  - `prompt_en`: Yazma ya da konuşma görevi.
- **`key`**: Cevap anahtarı. Öğrenci bunu görmez; açıklamalar yanlış cevaptan sonra gösterilir.
  - `correct` / `accepted`: Doğru cevaplar.
  - `distractors`: Yanlış şıkların her birine verilen hata kodu ve geri bildirim.
  - `wrong_patterns`: Beklenen yanlış cevaplar ve kodları.
  - `explanation_short_tr`: Yanlış cevaptan hemen sonra çıkan 1–2 cümle.
  - `explanation_long_tr`: "Daha fazla açıkla" denince çıkan açıklama.
  - `hint_tr`: İpucu.

Etkinlik türlerinin kısa açıklaması:

| Tür | Öğrenci ne yapar |
| --- | --- |
| `mcq_read` | Okur, şık seçer |
| `gap_fill` | Boşluğu doldurur |
| `word_order` | Karışık kelimeleri sıraya koyar |
| `translate_tr_en` | Türkçe cümleyi İngilizceye çevirir |
| `short_write` | 1–3 cümle yazar |
| `listen_choose` | Dinler, şık seçer (`text_en` seslendirilir) |
| `speak_answer` | Soruya sesli cevap verir |

### Uygun sayılması için

Bir etkinlik ancak **hepsi** doğruysa uygundur:

1. **Seviye:** Kelimeler A1–A2 düzeyinde. Cümle başına en çok 12 kelime (A1) ya da 16 kelime (A2).
2. **Tek konu:** Etkinlik yalnızca başlıktaki konuyu ölçüyor. Başka bir konuda takılıp yanlış yapmak mümkün değil.
3. **Cevap anahtarı doğru:** Doğru cevap gerçekten doğru. Kabul edilmesi gereken başka doğru cevaplar varsa `accepted` listesinde.
4. **Hata kodları doğru:** Her yanlış şıkkın ve yanlış kalıbın kodu, o hatanın gerçek kaynağını gösteriyor. Kodların anlamı `supabase/seed/l1_codes.csv` dosyasında.
5. **Açıklamalar:** Türkçe, "sen" dilinde, yargısız ve kısa. Kısa açıklama en çok 2 cümle.
6. **İçerik:** Gerçek kişiler hakkında iddia yok. Hassas (siyasi, dini, yetişkin) içerik yok.

### Nasıl işaretlersin?

Her etkinliğin altındaki kutuyu doldur:

- Uygunsa: `- [x] Uygun`
- Uygun değilse: kutuyu boş bırak ve altına bir satır not yaz. Örnek:
  `Not: "had" için kod yanlış, L1.PERFECT_PAST değil GEN.VERB_FORM olmalı.`

### Dikkat

- Küçük üslup tercihlerini ("ben şöyle yazardım") uygunsuz sayma; not olarak yaz. **Uygunsuz** yalnızca öğrenciyi yanıltacak, seviyesini aşan ya da yanlış teşhise yol açacak durumlar içindir.
- Aynı sorun birden çok etkinlikte varsa (ör. açıklamalar hep çok uzun) bunu en sona genel bir not olarak ekle. Komutu düzeltirken en çok bu notlar işimize yarar.

---

## Görev 2 — 40 cümlelik altın set

### Ne yapacaksın?

Gerçekçi 40 öğrenci cevabı yazacaksın. Her biri için öğrencinin hatasını senin bildiğin "doğru" hata koduyla etiketleyeceksin. Tabloyu `altin-set-sablon.csv` dosyasında doldurabilirsin; dosya Excel ya da Google Sheets ile açılır.

### Ne işe yarayacak?

Yapay zekâ, öğrencinin yazdığı serbest cevapları değerlendirip hataya kod koyuyor. Teşhis motoru bu kodlara bakarak "hatanın kaynağı konu mu, beceri mi?" sorusuna cevap veriyor. Altın set, **yapay zekânın kodlarının senin kodlarınla ne kadar uyuştuğunu** ölçecek.

- **Hedef:** en az %80 uyum, yani 40 cümlenin en az 32'sinde aynı kod.
- **Tutmazsa:** önce modelin daha dikkatli düşünmesini sağlarız; o da yetmezse daha güçlü bir modele geçeriz.
- **İleride:** aynı set, pilot sırasında modelin kalitesini izlemek için de kullanılır.

### Tablonun sütunları

| Sütun | Ne yazılır | Örnek |
| --- | --- | --- |
| `id` | Sıra numarası | `g01` |
| `etkinlik_turu` | `translate_tr_en` (çeviri) ya da `short_write` (kısa yazma) | `translate_tr_en` |
| `konu` | Hedef konunun kimliği (`supabase/seed/topics.csv`, `id` sütunu) | `g.present_simple_3sg` |
| `seviye` | `A1` ya da `A2` | `A1` |
| `gorev` | Öğrenciye verilen görev. Çeviride Türkçe cümle, kısa yazmada İngilizce yönerge | `Kardeşim her gün futbol oynar.` |
| `model_cevap` | Beklenen doğru İngilizce cevap | `My brother plays football every day.` |
| `ogrenci_cevabi` | Öğrencinin yazdığı cevap, **hatasıyla birlikte** | `My brother play football every day.` |
| `dogru_mu` | Cevap doğruysa `evet`, hatalıysa `hayir` | `hayir` |
| `birincil_kod` | En önemli hatanın kodu (`supabase/seed/l1_codes.csv`). Doğru cevapta boş | `L1.3SG_S` |
| `diger_kodlar` | Varsa başka hataların kodları, `;` ile ayrılmış. Ölçümde kullanılmaz, bilgi için | `GEN.SPELLING` |
| `not` | İstersen kısa açıklama | `3. tekil -s yok` |

### Nasıl dağıtmalısın?

- **Doğru cevaplar:** yaklaşık **8 cümle** tamamen doğru olsun (`dogru_mu = evet`). Model doğru cevaba boşuna hata bulmamalı; bunu da ölçüyoruz.
- **Hatalı cevaplar:** kalan **32 cümle** hatalı olsun. Mümkün olduğunca **çok farklı kod** kullan; en az 12 farklı kod hedefle. Bir koda en çok 4 cümle yeter.
- **Türler:** yaklaşık yarısı `translate_tr_en`, yarısı `short_write` olsun.
- **Seviye:** A1 ve A2 karışık olsun.
- **Kod türleri:** `GEN.*` kodlarından (yazım, kelime seçimi) da birkaç örnek koy. Model Türkçe kaynaklı hatayı genel hatadan ayırabilmeli.

### Dikkat

- **Ölçülen yalnızca birincil kod.** Cümlede birden çok hata varsa en önemlisini `birincil_kod`'a yaz. Yapay zekâ bu kodu bulursa uyum sayılır. Tartışmalı, iki koda eşit uyan cümlelerden kaçın.
- **Gerçekçi ol.** Hazırlık öğrencisinin gerçekten yapacağı hatalar olsun; yapay ya da abartılı hata üretme.
- **Kişisel veri yok.** Gerçek öğrenci cevaplarından yola çıkıyorsan isim, okul ve kişisel bilgi çıkar. Bu cümleler değerlendirme için yapay zekâ sağlayıcısına gönderilecek.
- **Her cümle tek konu.** `konu` sütunu, hatanın beklendiği konuyla uyumlu olsun.
- **`short_write` cevapları kısa olsun:** 1–3 cümle yeterli.
- **Kodları kopyala.** Kod ve konu kimliklerini dosyalardan aynen kopyala (büyük/küçük harf ve nokta dahil). Yanlış yazılan kod ölçümü bozar.

### Teslim

Doldurduğun dosyayı mühendise gönder. JSON'a çevirip `scripts/data/golden.json` olarak kaydeder ve ölçümü çalıştırır. Bir çalıştırmanın maliyeti yaklaşık 0,03 $. Sonuç ve uyuşmayan cümlelerin listesi sana geri gelir. Uyuşmayan cümlelerde bazen modelin haklı olduğu da çıkabilir; o durumda etiketi birlikte düzeltiriz.
