# Ölçme ve öğrenen modeli: araştırma ve tasarım önerisi

> **Durum: ÖNERİ, onay bekliyor (18.11.2026).** `docs/SPEC.md`, `SCOPE.md`, `ROADMAP.md` ve `PRD.md` değiştirilmedi. Gereken belge değişiklikleri Bölüm 11'de öneri olarak duruyor. Ürün kodu yazılmadı; yalnızca araştırma betikleri eklendi (`docs/arastirma/sim/`, ürün koduna dokunmuyor).
>
> **Soru:** Öğrenciyi az soruyla ve kesin biçimde nasıl tanırız, A2'nin üstündeki kişiyi nasıl ayırırız ve öğrenme profili neden hatası olmayan öğrenciye bile "eksik" diyor?

---

## 0. Kısa özet

1. **Üç şikâyetin üçü de tasarımdan geliyor.** Mevcut kodla yeniden ürettim (`docs/arastirma/sim/mevcut_motor.ts`):
   - Yerleştirme 14 sabit sorudan oluşuyor; bunların 12'si A1 konusu. Sonuç yalnızca A1 ya da A2 olabiliyor; A2'nin üstünü ölçecek soru yok.
   - 14 sorunun hepsini doğru cevaplayan öğrencinin ölçülen 14 hücresinden 12'si "zayıf" görünüyor ve ona yine 3 "tahmini zayıf nokta" gösteriliyor. Ustalık puanı öğrenciye değil, konunun L1 riskine göre başlıyor. Başlangıç değeri de "zayıf" bandının içinde kalıyor.
   - 120 konu×beceri hücresi birbirinden habersiz. Cevapların %97'sini doğru veren öğrenci 40 oturumun (pilotun tamamı) sonunda bile ızgarayı "sağlam"a çeviremiyor. 20 sanal öğrenciden 10'u en az bir yanlış teşhis alıyor; %90 doğru cevap veren öğrencilerde bu 20/20, kişi başı 5,6 yanlış teşhis.
2. **Önerdiğin merdiven yöntemi literatürde var.** Weiss'ın 1973'teki "stradaptive" testi ve psikofizikteki merdiven yöntemleri bu yapıda. Sezgileri doğru: kolaydan başlamak, ilk hatada elememek, sınırda daha çok sormak. Ama karar verirken yalnızca o seviyedeki son birkaç cevaba bakıyor. Simülasyonda yaklaşık 9 soruda %70–74 doğruluk verdi ve A2 öğrencilerin **%15–19'unu yanlışlıkla "seviye üstü" diye dışarıda bıraktı**.
3. **Öneri 1, yerleştirme: Bayesçi sınıflama testi.** Aynı sezgilerin istatistiksel hâli: IRT (madde tepki kuramı), dikkatsizlik payı olan 4 parametreli model ve "sınıf olasılığı %95'i geçince dur" kuralı. Simülasyonda **ortalama 14–19 soruda %85–91 doğruluk** verdi. Kesim noktasından uzak öğrencilerde ağır hata %3–8; mevcut testte bu oran %19–34, merdivende %18–22. A2 öğrencinin yanlışlıkla dışlanma oranı %0,6–2,5.
4. **Öneri 2, kapsam kapısı.** Yerleştirmede ve oturumlar boyunca P(seviye ≥ B1) ≥ 0,9 olursa öğrenciye hizmet verilmez. "Çok yakında senin için de buradayız" ekranı ve bekleme listesi gösterilir. Bunun için bankaya yalnızca ölçme amaçlı B1/B2 maddeleri eklenir; bu maddeler öğretilmez.
5. **Öneri 3, öğrenme profili: belirsizlik taşıyan, çok bileşenli bir Elo.** Glicko ve TrueSkill mantığıyla çalışır. Her cevap şu terimlerin toplamıyla açıklanır: genel seviye + beceri + konu + konu×beceri. Her terimin bir ortalaması ve bir belirsizliği vardır. Temel ilke **"kanıt yoksa hüküm yok"**. Simülasyondaki etkisi:
   - B1–B2 öğrencide yanlış "zayıf" oranı %8–27'den %0–1'e iniyor.
   - Bildiği konular yerleştirmeden hemen sonra %70–85 oranında "sağlam" görünüyor.
   - A2 öğrencide "çalışılacak" etiketlerinin isabeti %40–65'ten %95–98'e çıkıyor.
6. **Öneri 4, değerlendirmede yanlış pozitif.** Değerlendirme komutu "hata yok" ihtimalini varsayılan kabul edecek. Değerlendirme birkaç kez örneklenecek ve yalnızca düzeltme düzeyinde çoğunluğun onayladığı hata sayılacak. Yanlış pozitif oranı anadil ve ileri düzey cevaplardan oluşan bir kontrol setiyle ölçülecek.
7. **Maliyet ve emek.** Hesaplama maliyeti ihmal edilebilir: cevap başına 1 ms'den az. Asıl yatırım içerik tarafında: 150'den fazla seviyelendirilmiş madde ve pedagoji emeği. Değerlendirmedeki çoklu örnekleme dil modeli maliyetini artırır (Bölüm 8.2).
8. **Karar gereken 9 soru Bölüm 12'de.**

---

## 1. Sorun tanımı ve kök neden analizi (kodla kanıtlı)

### 1.1 Yerleştirme A2'nin üstünü göremiyor ("tavan etkisi")

- `estimateLevel` (`lib/session/placement.ts:63`) iki kurala bakıyor: A2 beyanı ya da cevapların en az %60'ının doğru olması A2 sayılıyor; geri kalan her durum A1. Seviye türü yalnızca `"A1" | "A2"` (`lib/engine/types.ts:9`). Veritabanında da `profiles.level_est check in ('A1','A2')` kısıtı var.
- Bankadaki 14 sorunun 12'si A1 konusu, 1'i A2 (present perfect), 1'i konuşma. **B1 sorusu yok.** Bu yüzden güçlü bir A2 öğrencisi, bir B2 öğrencisi ve bir anadil konuşuru aynı puanı alıyor (14/14). Sistem aradaki farkı ölçemez; buna tavan etkisi denir.
- PRD zaten "A1–A2 dışındaki seviyeler v1'de bilerek dışarıda kalır" diyor (PRD §2). Ama bunu uygulayan bir mekanizma yok.
- A2 beyanı tek başına A2 sonucunu veriyor. Oysa öz değerlendirme ile ölçülen seviye arasındaki ilişki orta düzeyde: meta-analizlerde r ≈ 0,47–0,55 [28, 29]. Beyan önsel bilgi olarak kullanılabilir, karar olarak kullanılmamalı.

### 1.2 "Tahmini zayıf noktalar" her durumda üç konu gösteriyor

`weakPoints` (`lib/session/placement.ts:80`), yerleştirmede sorulan konular arasından ustalığı en düşük üç konuyu **her durumda** döndürüyor. Cevabın doğru ya da yanlış olmasına bakmıyor. 14/14 yapan öğrenciye "am / is / are", "Özne zamirleri (he / she / it)" ve "do / does ile soru ve olumsuz" zayıf nokta olarak gösteriliyor. `PlacementSummary.tsx` de "İlk günlük oturumun şu an bu konulara göre hazırlanıyor" diyor. PRD F2 bu davranışı istiyor ("3 konu"); sorun kodda değil, kabul kriterinde.

### 1.3 Ustalık puanı kötümser başlıyor ve hücreler bilgi paylaşmıyor

Kaynak: `lib/engine/mastery.ts` ve SPEC 4.1.

**Önsel değer zayıf bandının içinde.** Önsel değer `0,50 − 0,15 × l1_risk`, yani 0,50, 0,35 ya da 0,20. "Zayıf" eşiği ise 0,45. 30 dilbilgisi konusundan 25'inin L1 riski 1 ya da 2; bu konular "zayıf" bandının içinde başlıyor. Sonuç olarak **doğru cevap ekranda kırmızıya dönüşüyor**. Örnek: L1 riski 2 olan bir konuda tek bir doğru tanıma cevabı puanı 0,20'den 0,32'ye taşır. Hücre "bilinmiyor"dan "zayıf"a geçer.

**Sağlam sayılmak için çok sayıda ardışık doğru gerekiyor.** EMA (üstel hareketli ortalama) yavaş ilerlediği için "sağlam" eşiğine (≥ 0,70) ulaşmak şu kadar ardışık doğru cevap istiyor:

| L1 riski | Tanıma (α = 0,15) | Kontrollü (α = 0,25) |
| --- | --- | --- |
| 2 | 7 doğru | 4 doğru |
| 1 | 5 doğru | 3 doğru |

**Hücreler bilgi paylaşmıyor.** 30 konu × 4 beceri ve 2 sesletim hücresi, toplam 122 hücre var. Her hücre kendi kanıtını bekliyor. Yazmada mükemmel olmak konuşma hücresini etkilemiyor; A2 konularındaki başarı A1 hücrelerini etkilemiyor. Güçlü bir öğrenciyi "tanımak" için yaklaşık 122 × (3–7) ≈ **400–800 doğru cevap** gerekiyor. Oturum başına 8–10 etkinlikle bu 40–90 oturum demek.

**Planlayıcı en temel konulara dönüyor.** Planlayıcının önceliği `1 − min ustalık + 0,15 × l1_risk` (`lib/engine/planner.ts:92`). Bu formül her seferinde en "zayıf" görünen A1 temel konularını seçiyor. Sonuçta B1–B2 bir öğrenciye am / is / are çalıştırılıyor.

**Gerçek kodla yeniden üretim.** Komut: `npx tsx docs/arastirma/sim/mevcut_motor.ts 0.97 40 20`. Senaryo: yerleştirmede 14/14 doğru, sonra her cevap %97 olasılıkla doğru.

| An | Bilinmiyor | Zayıf | Gelişiyor | Sağlam | Odak konusu |
| --- | --- | --- | --- | --- | --- |
| Yerleştirmeden sonra | 108 | **12** | 2 | **0** | — |
| 1. oturum | 101 | 18 | 3 | 0 | am / is / are |
| 3. oturum | 91 | 21 | 10 | 0 | Özne zamirleri |
| 10. oturum | 71 | 18 | 33 | 0 | in / on / at (zaman) |
| 20. oturum | 45 | 11 | 62 | 4 | Present perfect |
| 40. oturum | 8 | 0 | 68 | 46 | did ile soru |

İlk 12 oturumun odak konuları sırasıyla şöyle: am / is / are (2 kez), özne zamirleri, iyelik sıfatları (2 kez), the, present continuous, the, do / does, in / on / at (zaman), in / on / at (yer, 2 kez).

### 1.4 Teşhis kuralları gürültüyü teşhise çeviriyor

SPEC 4.3'teki kurallar EMA puanlarına sabit eşikler uyguluyor (n ≥ 3, fark ≥ 0,30 gibi). EMA son cevaplara çok duyarlı ve örneklemler küçük. Bu yüzden rastgele dikkatsizlik hataları teşhise dönüşüyor.

Simülasyondaki öğrencilerin dört becerisi de eşit güçte. Yani bu öğrenciler için üretilen her teşhis **yanlış**:

| Öğrencinin doğru oranı (her beceride aynı) | En az bir yanlış teşhis alan | Toplam yanlış teşhis (20 öğrenci, 40 oturum) |
| --- | --- | --- |
| %97 | 10/20 | 17 |
| %90 | 20/20 | 112 (kişi başı 5,6) |

### 1.5 Değerlendirme komutu "hatasız cevap" ihtimalini zayıf tutuyor

`lib/ai/prompts/grade.ts` "only real grammar errors" diyor. Ancak:

- Hatasızlığı varsayılan kabul etmiyor.
- Hata başına güven ya da kesinlik bilgisi istemiyor.
- "Daha doğal bir söyleyiş" ile "hata"yı ayırmasını söylemiyor.
- A2 üstü yapıların doğru kullanımını kaydedecek bir alan yok: `evidence` alanı yalnızca konu listesini kapsıyor.
- Yanlış pozitif oranını ölçen bir kontrol seti yok.

Literatürde dil modellerinin, hatası az olan metinde fazladan düzeltme yaptığı iyi belgelenmiş [46–49]. Anadil konuşurunun cevabında "hata" bulunması bu davranışın beklenen sonucu.

> Not: Bu madde koddan ve literatürden çıkarıldı; gerçek API çağrısıyla ölçülmedi. Ölçüm için `eval-grading-precision` betiği öneriliyor (Bölüm 8.3). Çalıştırmadan önce maliyet onayı istenecek.

### 1.6 Belirti → kök neden → çözüm

| Belirti | Kök neden | Çözüm (bölüm) |
| --- | --- | --- |
| B2 öğrenci "A2" çıkıyor, hizmet alıyor | B1 maddesi yok, %60 kuralı, `Level` türü | Bayesçi sınıflama testi + kapsam kapısı (5, 6) |
| 14/14 yapana 3 zayıf nokta | `weakPoints` her zaman 3 konu döndürüyor | Zayıf nokta yalnızca kanıtla gösterilir (5.5) |
| Doğru cevap "zayıf" görünüyor | Önsel değer zayıf bandında; önsel öğrenciye değil konuya bağlı | Önsel değer yerleştirmeden gelir (7.1) |
| Güçlü öğrenciyi tanımak yüzlerce soru sürüyor | Hücreler bağımsız | Hiyerarşik model: genel seviye bütün hücreleri bilgilendirir (7.1) |
| Yanlış teşhis | Küçük örneklem + EMA + sabit eşikler | Teşhis sonsal olasılıktan (posterior) türetilir (7.4) |
| Anadil cevabında "hata" | Kesinlik öncelikli değil, ölçülmüyor | Kesinlik komutu + çoğunluk oyu + kontrol seti (8) |

---

## 2. Araştırma: alan bu konularda ne biliyor?

### 2.1 Merdiven yöntemi: 1970'lerin "stradaptive" testi

Senin tarif ettiğin yöntem iki yerde karşımıza çıkıyor:

- **Ölçme bilimi:** Weiss'ın (1973) **stratified adaptive ("stradaptive")** testi [1]. Maddeler zorluk katmanlarına ayrılır. Doğru cevapta üst katmana, yanlışta alt katmana geçilir; durma kuralları katman içindeki hatalara bakar.
- **Psikofizik:** Aynı yapıya **merdiven** (up-down staircase) yöntemi denir [2].

Her iki alan da zamanla olasılık temelli yöntemlere geçti: ölçmede IRT tabanlı uyarlamalı test (CAT) [5, 6], psikofizikte QUEST ve Psi gibi Bayesçi yöntemler [3, 4]. Geçişin nedenleri:

- Merdiven, karar verirken yalnızca o seviyedeki son birkaç cevaba bakar; önceki cevapların bilgisini atar.
- Bir seviyedeki bütün maddelerin aynı zorlukta olduğunu varsayar. Oysa bir A2 maddesi başka bir A2 maddesinden çok daha zor olabilir.
- Tek bir şanslı ya da şanssız blok kararı belirleyebilir.

Senin sezgilerinin her birinin karşılığı olan bir bileşen var:

| Senin kuralın | Bilimsel karşılığı |
| --- | --- |
| "Önce temel seviyeler sorulur" | Önsel dağılım + 1–2 ısınma maddesi |
| "İlk hatada elenmez" | Tüm cevapları birlikte tartan olabilirlik; 4PL modeldeki dikkatsizlik payı (üst asimptot d ≈ 0,97) [7] |
| "O seviyeden birkaç soru daha sorar" | Kesim noktasında en bilgilendirici maddeyi seçmek [11] |
| "Yarı yarıya ise o seviyedir" | IRT'de θ = b noktasında doğru cevap olasılığı 0,5'tir; seviye, θ'nın kesim noktalarına göre konumudur |
| "Çoğu yanlışsa bir alt seviye, çoğu doğruysa bir üst" | Sonsal dağılım (posterior) her cevaptan sonra kendiliğinden kayar; "atlama" adımına gerek kalmaz |

### 2.2 Madde tepki kuramı (IRT) ve uyarlamalı test (CAT)

IRT, öğrencinin gizil yeteneğini (θ) ve maddenin özelliklerini aynı logit ölçeğine koyar. Her maddenin dört parametresi vardır: zorluk (b), ayırt edicilik (a), tahminle doğru bulma olasılığı (c) ve dikkatsizlik payı (d). Doğru cevap olasılığı şöyle hesaplanır:

`P(doğru) = c + (d − c) · σ(a · (θ − b))`

CAT her cevaptan sonra θ tahminini günceller ve o an en çok bilgi verecek maddeyi seçer. Aynı ölçme kesinliğine sabit testlerden belirgin biçimde daha az soruyla ulaşır [6].

### 2.3 Sınıflama testleri (CCT): az soruyla karar

Bizim ihtiyacımız θ'yı tam ölçmek değil; "A1 mi, A2 mi, yoksa ötesi mi?" sorusuna karar vermek. Bunun için ayrı bir literatür var:

- **SPRT.** Wald'ın sıralı olasılık oranı testi [8] sınıflamaya Reckase tarafından uyarlandı [9]. Spray ve Reckase'in çalışmasında [10], eşit sınıflama doğruluğunda SPRT'nin sıralı Bayes yönteminden daha az madde istediği görüldü.
- **Kesim noktasında madde seçimi.** Eggen [11], maddeyi kesim noktasında en çok bilgi verecek şekilde seçmenin sınıflama testini kısalttığını gösterdi.
- **Üç kategori.** Eggen ve Straetmans [12], bir yerleştirme testinde öğrencileri **üç kategoriye** ayırmak için SPRT'yi genişletti ve ortalama madde sayısında **en az %22 azalma** buldu. Bu, bizim A1 / A2 / B1+ problemimizin doğrudan karşılığı.
- **GLR.** Genelleştirilmiş olabilirlik oranı (GLR) ve türevleri benzer doğrulukla daha az madde kullanıyor [13, 14].
- **Bayesçi karar kuramı.** Ustalık testlerini tasarlamak için kullanılıyor [15]. Avantajı şu: kalibre edilmiş sınıf olasılıkları verir. Bu olasılıklar "kapıdan geçir ya da geçirme" gibi asimetrik kararlarda doğrudan kullanılabilir.

### 2.4 Dil ölçmesinden ve diğer alanlardan örnekler

**Duolingo English Test (DET)** uyarlamalı bir test [16, 17].
- Uyarlamalı madde türleri arasında C-test, sahte kelimeli evet/hayır kelime testi, dikte ve **sesli tekrar** (elicited imitation) var.
- Madde zorluğunu makine öğrenmesiyle tahmin ediyor ve CEFR'e bağlı bir ölçek kullanıyor. Bu sayede insanlarla yapılan ön deneme ihtiyacını azaltıyor [16].

**Kelime testleri.**
- Kelime büyüklüğü CEFR seviyesiyle güçlü biçimde ilişkili. X_Lex ölçümüne göre yaklaşık değerler şöyle: A1 için 1.500 kelimenin altı, A2 için 1.500–2.500, B1 için 2.750–3.250, B2 için 3.250–3.750 [19].
- Evet/hayır kelime testleri sahte kelimelerle tahmin düzeltmesi yapıyor [18].
- LexTALE 5 dakikada uygulanıyor [20]. Ancak bir yineleme çalışması, genel yeterlikle ilişkisinin düşük–orta düzeyde kaldığını gösterdi [21]. Bu tür bir tarayıcı yalnızca zayıf önsel bilgi olarak kullanılabilir.

**Sesli tekrar (elicited imitation).** Yeterlikle ilişkisi meta-analizlerde r ≈ 0,66 [23]. Seviyeler arasında güçlü ayrım yapıyor (Hedges' g = 1,34) [22]. Bizde mevcut transkript ve dikte puanlama altyapısıyla, dil modeli değerlendirmesine gerek kalmadan puanlanabilir.

**ALEKS** bilgi uzayı kuramına (KST) dayanıyor [25]. Önkoşul ilişkileri sayesinde tek bir cevap birçok konu hakkında bilgi veriyor. Yüzlerce konu arasından yerleştirmeyi en çok 16–30 soruyla yapıyor [24, 59].

**Pearson GSE** 10–90 arası sürekli bir ölçek kullanıyor ve bu ölçek CEFR'e hizalı (A1 22'den başlıyor) [26]. Ders şu: CEFR etiketleri ölçeğin üstüne konan işaretler olmalı; ölçeğin kendisi sürekli olmalı.

**English Profile** her CEFR seviyesinin "kriter özelliklerini" (criterial features) çıkarıyor [27]. Serbest üretimde B1 üstü yapıların doğru kullanımını yakalamak için kullanılabilir.

### 2.5 Elo ve ötesi: öğrenen modelleri

**Elo eğitimde iyi çalışıyor.** Elo [30] eğitime Math Garden (Rekentuin) ile taşındı [33]. Bu sistem her cevaptan sonra hem öğrencinin yeteneğini hem maddenin zorluğunu anında güncelliyor. Pelánek ve arkadaşları Elo türevlerini sistematik olarak incelediler [34–36]. Vardıkları sonuç: Elo türevleri isabetli ve çevrimiçi sistemde kolay uygulanıyor. Öğrencinin ön bilgisini ve güncel bilgisini ayrı ayrı tahmin eden modüler yapı önerdiler.

**Elo'nun eksiği tam olarak bizim hatamız.** Elo puanının bir standart hatası yok ve puan varyansı zamanla şişiyor [37]. "Hiç ölçülmedi" ile "ortalama" arasındaki farkı göremiyor; bizdeki "kanıt yokluğu = zayıflık" hatası da bu. Çözümler:
- **Glicko** [31]: puana bir sapma (belirsizlik) ekliyor.
- **TrueSkill** [32]: bir takımın performansını oyuncuların becerilerinin toplamı olarak modelliyor; her beceri için Gauss inanç tutuyor.
- **Urnings** [38]: standart hatası bilinen, Elo'ya alternatif bir izleme yöntemi.

Bizim önerimiz TrueSkill'in eğitime uyarlanmış hâli. Bir cevabın başarısı, "genel seviye + beceri + konu + konu×beceri" bileşenlerinin toplamıyla açıklanıyor; rakip ise maddenin kendisi.

**Bilgi izleme (knowledge tracing) literatürü de aynı yönü gösteriyor:**
- Klasik BKT [39] her öğrenciye aynı önseli veriyor. Öğrenci başına önsel kullanmak tahmini güvenilir biçimde iyileştiriyor [40]; mevcut sistemde öğrenci düzeyinde önsel yok.
- Hiyerarşik Bayesçi IRT türevleri, derin bilgi izleme (DKT) ile eşit ya da daha iyi sonuç veriyor ve daha yorumlanabilir [41]. Gerekli esnekliklerle genişletilmiş BKT, DKT'den ayırt edilemiyor [42].
- Orta büyüklükte veride iyi özellikli lojistik regresyon öne çıkıyor; DKT ancak büyük veride üstün [43].
- DAS3H, madde zorluğu, öğrenci yeteneği, beceriler ve **unutma** bileşenlerini birleştiriyor [44].
- Duolingo'nun Birdbrain modeli de aynı ikiliyi kullanıyor: öğrenci yeteneği ve alıştırma zorluğu. Bu ikisi her alıştırmadan sonra güncelleniyor [45].

**50 kişilik pilot için sonuç:** Derin modeller veri yetersizliği yüzünden dışarıda kalıyor. Doğru aile, çevrimiçi Gauss güncellemeli hiyerarşik Bayesçi IRT. Veri büyüdükçe:
1. Gece toplu yeniden kalibrasyon.
2. Unutma ve uygulama geçmişi özellikleri (DAS3H ve LKT benzeri).
3. Çok büyük veride sinir ağı tabanlı modeller.

### 2.6 Büyük dil modelleriyle hata tespiti: aşırı düzeltme

- LLM'ler dilbilgisi düzeltmede (GEC) **fazladan düzeltme** yapma eğiliminde. Duyarlılıkları (recall) yüksek, kesinlikleri (precision) düşük [46–48].
- GEC değerlendirmesinde F0.5 ölçütü kullanılıyor; bu ölçüt kesinliğe duyarlılığın iki katı ağırlık verir [50]. Gerekçe, öğrenciye yanlış düzeltme göstermenin bir hatayı kaçırmaktan daha zararlı olması.
- Aynı modelden birkaç düzeltme örneklemek ve yalnızca örneklerde tekrar eden düzeltmeleri tutmak (**düzeltme düzeyinde çoğunluk oyu**) fazladan düzeltmeyi bastırıyor. Etki özellikle hatası az olan metinde, yani ileri düzey ve anadil cevaplarında belirgin [49].
- GPT-4'ün CEFR derecelendirmesi otomatik yazma değerlendirme sistemlerine yakın sonuç veriyor, ancak isabeti yazarın anadiline göre değişiyor [51].

### 2.7 Soğuk başlangıç: kalibrasyon verisi yokken

- Rasch kalibrasyonunda ±1 logit kararlılık için yaklaşık 30 kişi yetiyor; daha dar aralıklar için 100–150 kişi gerekiyor [52]. 50 kişilik pilotta her madde katılımcıların ancak bir kısmına gösterileceği için 150 maddeyi tek tek kalibre etmek mümkün değil.
- Pratik çözüm üç parçalı:
  1. Uzman ve CEFR bilgisinden gelen **bilgilendirici önseller**. Zorluk konu, seviye, madde türü ve uzunluk gibi özelliklerden tahmin edilir; bu fikir LLTM'ye dayanıyor [53].
  2. Kullanım sırasında **çevrimiçi güncelleme** (Elo ya da Urnings benzeri).
  3. Pilot sonunda **toplu kalibrasyon**.
- Dil modelleriyle "sanal katılımcı" üretmek ayırt edicilik tahmininde umut veriyor. Zorluk tahmininde daha zayıf kalıyor ve modeller düşük seviyeli öğrenciyi taklit etmekte zorlanıyor [54]. Bu yüzden dil modeli tahminleri yalnızca önsel olarak kullanılmalı.

---

## 3. Simülasyon çalışması

Tüm sayılar sentetik verilerden geliyor. Sonuçlar karşılaştırma içindir; gerçek pilot verisi farklı çıkacaktır. Betikler ve çıktılar `docs/arastirma/sim/` klasöründe. Ek A yeniden çalıştırmayı anlatıyor.

### 3.1 Yöntem

**Ölçek.** θ logit ölçeğinde. Kesim noktaları A1|A2 = 0 ve A2|B1 = 1,5. Ürünün üç sınıfı: A1 (alt seviyeler dahil), A2 ve B1+ (kapı).

**Banka.** 160 madde: pre-A1 20, A1 40, A2 40, B1 40, B2 20. Gerçek cevaplar 4PL modelden üretildi. Maddelerin yarısı 3 şıklı çoktan seçmeli (c = 0,15–0,30), yarısı yazılı cevap (c = 0). Dikkatsizlik payı d = 0,98; ayırt edicilik a ortalaması yaklaşık 1,2.

**İki senaryo.**
- *Kalibre:* sistem maddelerin gerçek parametrelerini biliyor.
- *Kalibre değil:* v1'in gerçeği. Zorluk tahmini gerçek değerden ortalama 0,5 logit sapıyor (b̂ = b + N(0; 0,5²)). Ayırt edicilik herkes için 1 kabul ediliyor, tahmin payı 1/3 sayılıyor. Seviye etiketleri de bu hatalı b̂ değerlerinden geliyor.

**Nüfuslar.**
- *Pilot benzeri:* %15 alt-A1, %35 A1, %35 A2, %15 B1+.
- *Tekdüze:* θ değerleri −2,5 ile 3,5 arasında eşit dağılmış (daha zor senaryo).

**Yöntemler.**
- *Mevcut 14:* 12 A1 + 2 A2 maddesi, %60 kuralı.
- *Merdiven:* senin önerin. İki ardışık doğrudan sonra üst seviyeye geçilir. İlk hatada o seviyede 6 maddelik blok tamamlanır. Blokta ≥ %70 doğruysa üste, ≤ %30 doğruysa alta geçilir; aksi hâlde o seviyede durulur. Bir de 10 maddelik blok sürümü denendi.
- *CAT-SE:* standart CAT; sonsal standart sapma ≤ 0,35 olunca durur.
- *SPRT-3:* Eggen ve Straetmans'ın üç kategorili SPRT'si [12].
- *BCCT:* önerilen Bayesçi sınıflama testi. Maddeyi beklenen sınıf belirsizliğini (entropiyi) en çok azaltacak şekilde seçer. En yüksek sınıf olasılığı ≥ 0,95 olunca durur (en az 5, en çok 25 madde). En çok maddeye ulaşılırsa kapı kararı ancak P(B1+) ≥ 0,8 ise verilir.
- *BCCT+kelime:* BCCT'ye ek olarak, θ ile r = 0,7 ilişkili kısa bir kelime tarayıcısı önsel bilgi olarak kullanılır.

**Ölçütler.**
- Doğruluk.
- Ortalama madde sayısı.
- *Ağır hata:* öğrencinin θ'sı en yakın kesim noktasından 0,3 logitten uzak olduğu hâlde yanlış sınıflanması.
- *Yanlış dışlama:* A2 olduğu hâlde B1+ sayılmak.
- *Kapı duyarlılığı:* B1+ olan öğrencinin kapıda yakalanma oranı.

### 3.2 Yerleştirme sonuçları (3000 sanal öğrenci)

**Pilot benzeri nüfus, kalibre edilmemiş banka (v1'in gerçeği):**

| Yöntem | Doğruluk | Ort. madde | Ağır hata | Yanlış dışlama (A2 → kapı) | B1+ yakalama |
| --- | --- | --- | --- | --- | --- |
| Mevcut 14 | 0,737 | 14,0 | 0,190 | 0 | **0** |
| Merdiven (blok 6) | 0,709 | 8,7 | 0,205 | **0,160** | 0,672 |
| Merdiven (blok 10) | 0,782 | 14,4 | 0,143 | 0,143 | 0,829 |
| CAT-SE | 0,911 | 30,0 | 0,032 | 0,032 | 0,826 |
| SPRT-3 | 0,894 | 20,6 | 0,046 | 0,030 | 0,777 |
| BCCT (0,95) | 0,867 | 19,0 | 0,068 | **0,006** | 0,601 |
| BCCT (0,90) | 0,883 | 17,4 | 0,056 | 0,008 | 0,664 |

**Pilot benzeri nüfus, kalibre banka (pilot sonrası hedef):**

| Yöntem | Doğruluk | Ort. madde | Ağır hata | Yanlış dışlama | B1+ yakalama |
| --- | --- | --- | --- | --- | --- |
| Mevcut 14 | 0,727 | 14,0 | 0,197 | 0 | 0 |
| Merdiven (blok 6) | 0,700 | 8,9 | 0,217 | 0,185 | 0,770 |
| Merdiven (blok 10) | 0,784 | 14,5 | 0,145 | 0,127 | 0,811 |
| CAT-SE | 0,912 | 21,7 | 0,034 | 0,055 | 0,881 |
| SPRT-3 | 0,917 | 14,1 | 0,028 | 0,067 | 0,902 |
| BCCT (0,95) | 0,911 | 15,4 | 0,029 | 0,014 | 0,794 |
| BCCT (0,90) | 0,911 | 12,8 | 0,028 | 0,021 | 0,822 |
| BCCT + kelime tarayıcı | 0,912 | 15,1 | 0,030 | 0,019 | 0,777 |

Tekdüze nüfusta sonuçlar aynı yönde: mevcut test %58 doğruluk ve %33 ağır hata verirken IRT yöntemleri %85–92 doğruluk ve %2–8 ağır hata verdi (BCCT: %85–90 doğruluk, 14–17 madde). Tam tablo `sim/sonuclar/yerlestirme.txt` dosyasında.

**Okuma notları:**

1. **Tavan.** Mevcut test hiçbir B1+ öğrenciyi ayıramıyor. Ağır hatalarının çoğu, A2'nin üstündekileri "A2" saymasından geliyor.
2. **Merdiven.** Kısa ama isabetsiz. En pahalı hatayı, A2 öğrenciyi dışlamayı, %13–19 oranında yapıyor. Bloğu 10 maddeye çıkarmak 14 maddede bile doğruluğu ancak %78'e taşıyor.
3. **Doğruluk tavanı.** IRT yöntemlerinin doğruluğu %91 civarında doyuyor. Nedeni, öğrencilerin bir kısmının kesim noktasının hemen yanında durması: ±0,3 logit içindeki öğrenci 30 soruda bile kesin sınıflanamaz. Bu yüzden ağır hata oranı daha anlamlı bir ölçüt. Sınırdaki öğrenci için çözüm daha uzun test değil; oturumlar boyunca süren **sürekli kapı** (Bölüm 6).
4. **SPRT-3 ve BCCT.** Literatürle uyumlu olarak [10], kalibre bankada SPRT-3 biraz daha kısa. BCCT ise kalibre edilmiş sınıf olasılıkları üretiyor ve yanlış dışlamayı 3–10 kat azaltıyor. Kapı kararının asimetrik olması (Bölüm 6) ve öğrenen modeline önsel bilgi taşıması bu yüzden BCCT'yi daha uygun kılıyor.
5. **Kalibrasyonun değeri.** Kalibre banka BCCT'nin ortalama uzunluğunu 19,0'dan 15,4 maddeye indiriyor ve B1+ yakalamayı 0,60'tan 0,79'a çıkarıyor. Bankanın pilot verisiyle kalibre edilmesi bu yüzden yol haritasında (M15).
6. **Kelime tarayıcısı.** Kazancı küçük (yaklaşık 0,3 madde), öncelikli değil.

### 3.3 Madde sayısı–doğruluk eğrisi

Kaynak: `sim/sonuclar/yerlestirme_egri.txt`. Pilot nüfusu, kalibre banka, 1500 sanal öğrenci.

| Yöntem ve ayar | Ort. madde | Doğruluk |
| --- | --- | --- |
| Merdiven, blok 4 / 6 / 8 / 10 / 14 | 7,1 / 8,9 / 11,7 / 14,5 / 18,9 | 0,72 / 0,70 / 0,74 / 0,77 / 0,80 |
| SPRT-3, δ = 0,6 → 0,3 | 7,8 / 12,6 / 15,4 / 19,5 / 21,9 | 0,89 / 0,91 / 0,91 / 0,91 / 0,92 |
| BCCT, durma eşiği 0,80 → 0,98 | 9,2 / 11,4 / 13,5 / 17,1 / 20,0 | 0,89 / 0,92 / 0,90 / 0,91 / 0,92 |

Eşit uzunlukta IRT yöntemleri merdivenden yaklaşık 15–20 puan önde. Merdiven 19 maddede %80'e ulaşabiliyor; IRT yöntemleri 8–9 maddede %89'a ulaşıyor. Kalibre edilmemiş bankada IRT yöntemlerinin aynı doğruluk için yaklaşık 4–6 madde daha fazla istediği görülüyor.

### 3.4 Öğrenen modeli sonuçları

Kaynak: `sim/sonuclar/ogrenen_modeli_*.txt`.

**Öğrenci tipleri.** Her tipten 60 sanal öğrenci, 30 konu × 4 beceri:
- **B2:** θ ≈ 3,0.
- **B1:** θ ≈ 2,1.
- **A2 boşluklu:** θ ≈ 0,9, bilerek eklenmiş eksikler var. Konu eksikleri: the, üçüncü tekil -s, present perfect. Beceri eksikleri: düzensiz geçmiş zaman ve do / does konularında yalnızca konuşma.
- **A1:** θ ≈ −0,9.

**Gerçek ustalık tanımı.** Kontrollü bir maddeyi doğru cevaplama olasılığı ≥ 0,8 ise "ustalaşmış", ≤ 0,5 ise "eksik".

**Karşılaştırılan modeller.**
- **M0:** mevcut motor (EMA).
- **M1+:** önerilen model. Yeni yerleştirmenin θ sonsal dağılımıyla başlıyor ve ayırt edicilik parametresi bilerek yanlış verildi (1,0; gerçek değer 1,3).

**Planlayıcı.** Odak + belirsiz hücre + keşif karışımı; oturum başına 9 etkinlik.

| Tip ve ölçüt | Model | Yerleştirme | 1. oturum | 5. | 10. | 40. |
| --- | --- | --- | --- | --- | --- | --- |
| **B2**, ustalaşılmış ama "zayıf" gösterilen hücre oranı | M0 | 0,08 | 0,13 | 0,15 | 0,18 | 0,23 |
| | **M1+** | **0,00** | 0,00 | 0,00 | 0,00 | 0,00 |
| **B2**, ustalığın tanınması ("sağlam" etiketi) | M0 | 0,00 | 0,00 | 0,01 | 0,05 | 0,21 |
| | **M1+** | **0,85** | 0,89 | 0,95 | 0,97 | 0,99 |
| **B1**, yanlış "zayıf" | M0 | 0,09 | 0,12 | 0,17 | 0,20 | 0,27 |
| | **M1+** | **0,00** | 0,01 | 0,00 | 0,00 | 0,00 |
| **B1**, ustalığın tanınması | M0 | 0,00 | 0,00 | 0,01 | 0,03 | 0,14 |
| | **M1+** | **0,70** | 0,73 | 0,78 | 0,83 | 0,91 |
| **A2 boşluklu**, yanlış "zayıf" | M0 | 0,11 | 0,15 | 0,24 | 0,30 | 0,27 |
| | **M1+** | 0,00 | 0,01 | 0,02 | 0,03 | 0,03 |
| **A2 boşluklu**, "çalışılacak" etiketinin isabeti | M0 | 0,40 | 0,49 | 0,54 | 0,55 | 0,65 |
| | **M1+** | — | **0,98** | 0,96 | 0,95 | 0,97 |
| **A2 boşluklu**, eklenmiş boşlukların bulunması | M0 | 0,14 | 0,22 | 0,42 | 0,55 | 0,77 |
| | **M1+** | 0,00 | 0,11 | 0,29 | 0,43 | 0,68 |
| **A2 boşluklu**, belirgin boşlukların bulunması (P ≤ 0,35) | M0 | 0,14 | 0,24 | 0,48 | 0,60 | 0,77 |
| | **M1+** | 0,00 | 0,18 | 0,47 | 0,64 | 0,88 |
| **A1**, "çalışılacak" duyarlılığı | M0 | 0,09 | 0,15 | 0,30 | 0,42 | 0,70 |
| | **M1+** | 0,03 | 0,12 | 0,41 | 0,65 | 0,97 |
| Doğru cevap olasılığı tahmininin hatası (RMSE), tüm tipler | M0 | 0,23–0,64 | | | | 0,21–0,49 |
| | **M1+** | 0,04–0,16 | | | | 0,02–0,12 |

**Kapı.** Yeni yerleştirmeyle B2 öğrencilerin 60/60'ı, B1 öğrencilerin 59/60'ı yerleştirmede yakalandı. A2 boşluklu öğrencilerden 1/60'ı yanlışlıkla yakalandı; bu, kapının gerçek üründe ek B1 maddeleriyle doğrulanması gerektiğini gösteriyor (Bölüm 6).

**Okuma notları:**

1. **Asıl şikâyet çözülüyor.** Güçlü öğrencide yanlış "zayıf" oranı sıfıra iniyor. Öğrencinin bildiği şey ilk günden "sağlam (tahmini)" olarak tanınıyor.
2. **Bilinçli bir bedel var.** M1+ bir konuya "çalışılacak" demek için o konuda en az iki doğrudan cevap bekliyor. Bu yüzden yerleştirmeden hemen sonra boşluk göstermiyor ve ilk oturumlarda M0'dan daha yavaş boşluk buluyor. Karşılığında M0'ın "zayıf" etiketlerinin üçte biri ile yarısı yanlışken M1+'ınkilerin %95–98'i doğru. M0 boşlukları "her şeyi zayıf göstererek" buluyor.
3. **Planlayıcı politikası belirleyici.** Eklenmiş boşlukların 40. oturumdaki bulunma oranları:
   - Rastgele etkinlik seçimi: %78.
   - Odak + belirsiz hücre + keşif karışımı: %68.
   - Yalnızca "en belirsiz hücreyi sor" (saf belirsizlik örneklemesi): %34.

   Saf belirsizlik örneklemesi, doğası gereği sınırda olan hücrelerde takılıyor. Sonuç: planlayıcı, şüpheli boşluğu **başka bir beceride** sınayarak doğrulamalı ("konu mu beceri mi?" sorusu da tam olarak bu) ve devreye alınmadan önce simülasyonla test edilmeli (M13 Bitti testi).
4. **A1 öğrencide yanlış "zayıf" oranı anlamsız.** Bu öğrencilerde gerçekten ustalaşılmış hücre sayısı ortalama 1'in altında (0,3–1,2); oran çok küçük bir paydaya dayanıyor.
5. **Ayırt edicilik doğru verildiğinde** (a = 1,3; `sonuclar/ogrenen_modeli_product_a13.txt`) ustalığın tanınması bir miktar daha artıyor. B1 öğrencide yerleştirmeden sonra 0,70 → 0,78, 40. oturumda 0,91 → 0,94. Boşluk bulma aynı kalıyor (40. oturumda 0,67). Bu fark, gece kalibrasyonunun (M15) değerini gösteriyor.

### 3.5 Sınırlılıklar

- Gerçek öğrenciler modelin varsaydığı toplamsal yapıdan farklı davranabilir: konular arası etkileşim, yorgunluk, motivasyon gibi.
- Madde zorlukları uzman tahmininden çok daha fazla sapabilir.
- Öğrenme dinamiği (öğrencinin pratik yaparak gelişmesi) simülasyonda yok; yetenekler sabit tutuldu. Model süreç gürültüsüyle öğrenmeyi izlemeye hazır.
- Simülasyonlar yöntemleri **karşılaştırmak** içindir; mutlak sayılar pilotta yeniden ölçülmeli (Bölüm 9).

---

## 4. Önerilen sistem: genel mimari

```text
                 ┌──────────────────────────┐   θ sonsalı (ortalama, sd)   ┌─────────────────────────────┐
 Yerleştirme ──▶ │ Bayesçi sınıflama testi  │ ───────────────────────────▶ │ Öğrenen modeli v2           │
 maddeleri       │ 4PL, EAP, entropi seçimi │                              │ θ_genel + s_beceri          │
 (kalibre banka) └────────────┬─────────────┘                              │ + d_konu + e_konu×beceri    │
                              │ P(B1+) ≥ 0,9                               │ (her terim: ortalama +      │
                              ▼                                            │  belirsizlik)               │
                   ┌───────────────────┐    P(θ ≥ B1) ≥ 0,95 (oturumlarda)  └──────┬──────────────┬───────┘
                   │  Kapsam kapısı    │ ◀──────────────────────────────────────── │              │
                   │  bekleme listesi  │                                    etiketler, teşhis,  │
                   └───────────────────┘                                    planlayıcı, tekrar  │
                                                                                                │
 Oturum cevabı ──▶ yerel değerlendirme / kesinlik öncelikli LLM değerlendirmesi ──(kanıt ağırlığı)┘
                                                                                                │
 Gece işi: madde, konu ve tür zorlukları, τ'lar, unutma hızı ◀── attempts (tüm geçmiş) ─────────┘
```

Tasarım ilkeleri:

1. **Tek ölçek.** Öğrenci, madde ve konu aynı logit ölçeğinde duruyor. CEFR etiketleri bu ölçeğin üstündeki kesim noktaları.
2. **Her tahminin bir belirsizliği var.** "Bilinmiyor" bir puan değil, geniş bir dağılım.
3. **Kanıt yoksa hüküm yok.** Öğrenciye "zayıf" demek doğrudan kanıt ister. Tahmine dayanan şeyler "tahmini" diye işaretlenir.
4. **Tüm cevaplar birlikte tartılır.** Tek bir hata kararı belirlemez.
5. **Sınırlarını bilir.** Kapsam dışı seviye ve kapsam dışı hata ayrıca ele alınır.
6. **Ölçülebilir.** Her bileşenin bir doğrulama ölçütü var (Bölüm 9).

---

## 5. Yerleştirme v2: Bayesçi sınıflama testi

### 5.1 Ortak ölçek

- θ logit ölçeğinde tutulur. Kesim noktaları: pre-A1|A1, A1|A2, A2|B1 ve B1|B2. Ürün kararları için yalnızca A1|A2 ve A2|B1 kullanılır.
- **Başlangıç kesim noktaları**, komşu seviyelerdeki maddelerin ortalama zorluklarının orta noktasıdır. Pilot sonunda pedagoji sahibiyle **standart belirleme** yapılır: zorluğa göre sıralanmış maddelerde "bu seviyedeki öğrenci buraya kadar yapar" denen yere imleç konur (bookmark yöntemi).
- **Konu zorlukları** (`topics` için önerilen yeni sütun `irt_b`) aynı ölçekte tutulur. Başlangıç değeri CEFR seviyesi ve L1 riskinden gelir; sonra veriden kalibre edilir.
- İsteğe bağlı olarak öğrenciye 10–90 arası bir ölçek gösterilebilir (GSE benzeri) [26].

### 5.2 Madde bankası

**Seviye dağılımı.** Bankada en az 150 madde olmalı:

| pre-A1 | A1 | A2 | B1 | B2 |
| --- | --- | --- | --- | --- |
| ≈ 15 | ≈ 35 | ≈ 45 | ≈ 40 | ≈ 15 |

B1 ve B2 maddeleri **yalnızca ölçme** içindir; öğretilmez. Kapı kararını mümkün kılan bu maddelerdir.

**Madde türleri, dakika başına bilgiye göre öncelik sırasıyla:**
- Boşluk doldurma (tahmin payı yok).
- 4 şıklı çoktan seçmeli (3 şıklıdan daha az tahmin payı).
- Dikte: kelime düzeyinde kısmi puan verir, yani bir maddeden birden fazla bilgi çıkar.
- Dinle-seç.
- **Sesli tekrar:** cümleyi dinle ve tekrarla. Transkript ve WER (kelime hata oranı) ile puanlanır; dil modeli gerekmez.
- Kısa serbest konuşma: dil modeliyle CEFR bandı verilir. Ayrı bir boyut olarak tutulur ve kapıda destekleyici kanıt olarak kullanılır.

**Madde verisi.** `topic_id`, `skill`, `cefr`, `irt {a, b, c, d}`, `calib_source` (`expert | llm | online | batch`), `n_responses` ve `status`. Cevap anahtarı bugünkü gibi yalnızca sunucuda tutulur (`item_keys` kuralı).

**Kalibrasyon yolu:**
1. Önsel zorluk: CEFR bandının merkezi, konu ve madde türü özellikleri ve dil modeli tahmini. Pedagoji sahibi aynı seviyedeki maddeleri zorluğa göre sıralar (karşılaştırmalı yargı); bu sıralama önseli düzeltir.
2. Önsel ayırt edicilik: çoktan seçmelide 0,8, yazılı cevapta 1,2.
3. Çevrimiçi güncelleme: her cevaptan sonra madde parametreleri belirsizliklerine göre yavaşça güncellenir.
4. Toplu kalibrasyon: madde başına 30'dan fazla cevap birikince toplu kalibrasyon yapılır (M15).

### 5.3 Algoritma

```text
önsel: θ ~ N(μ0, 1,6²)
       μ0 beyana göre: A1 → −0,5 · A2 → 0,6 · "emin değilim" → 0,25

ısınma: güven veren 2 kolay A1 maddesi (ölçmeye de dahil)

döngü:
  sonsal dağılımı hesapla (241 noktalı ızgara)
  sınıf olasılıklarını hesapla: P(A1), P(A2), P(B1+)
  n ≥ 8 ve en yüksek sınıf olasılığı ≥ 0,95 → dur
  n ≥ 25 → dur (asimetrik kapı kuralı)
  sonraki madde: beklenen sınıf entropisini en çok azaltan madde
    kısıtlar:
      - bir konudan en çok 1 madde
      - beceri karışımı: okuma, dinleme ve yazmadan en az 3'er
      - çoktan seçmeli en çok %40
      - maruz kalma kontrolü: en iyi 3 maddeden rastgele biri
  maddeyi sor, yerel puanla, sonsalı güncelle

sonuç: sınıf + sınıf olasılıkları + θ (ortalama ve sd)
       → profiles + öğrenen modelinin önseli

kapı:
  P(B1+) ≥ 0,9 → kapsam kapısı (Bölüm 6)
  0,6 ≤ P(B1+) < 0,9 → 4–5 B1 maddelik "uzatma bloğu", sonra karar
```

- Puanlama 4PL modelle yapılır. Tahmin payı madde türünden, dikkatsizlik payı (d ≈ 0,97) genel olarak verilir. İlk hata sonucu çökertmez.
- Beklenen süre: ortalama 14–19 madde (durma eşiği 0,90 ile 12–17), yaklaşık 8–10 dakika (simülasyon). Bugünkü test 14 madde ve yaklaşık 7 dakika. Kalibrasyondan sonra ortalama kısalır (Bölüm 3.2).
- Konuşma maddesinin ağırlığı açık bir karar (Bölüm 12, soru 7).

### 5.4 Daha az soruyla daha net sonuç: kaldıraçlar

Etki sırasıyla:

| # | Kaldıraç | Kanıt |
| --- | --- | --- |
| 1 | **Tüm cevapları birlikte puanlamak** (IRT olabilirliği) | Simülasyon: eşit uzunlukta +15–20 puan doğruluk; merdivenin 19 maddede ulaştığına 8–9 maddede ulaşılıyor |
| 2 | **Sınıflamaya göre durmak**: "ne kadar kesin ölçtüm?" yerine "karar verebilir miyim?" | Simülasyonda kalibre bankada CAT-SE 21,7 madde, SPRT-3 14,1, BCCT 12,8–15,4. Literatür: üç kategoride en az %22 kısalma [12] |
| 3 | **Maddeyi kesim noktalarına yakın seçmek** | Eggen [11]; simülasyondaki SPRT-3 ve BCCT |
| 4 | **Daha ayırt edici maddeler**: tahmin payı düşük türler ve kısmi puanlı (politomik) maddeler | DET'in madde türleri [16, 17]; sesli tekrar r ≈ 0,66 [23] |
| 5 | **Kalibrasyon** | Simülasyon: BCCT'de 19,0 → 15,4 madde, B1+ yakalama 0,60 → 0,79 |
| 6 | Önsel bilgi (öz beyan, kısa kelime tarayıcısı) | Simülasyon: yaklaşık 0,3 madde kazanç, düşük öncelik [19–21, 28, 29] |
| 7 | (v2) Cevap süresini puana katmak | Maris ve van der Maas [58]. Ek bilgi verir; ancak telefonda süre gürültülü |

### 5.5 Sonuç ekranı

- "Başlangıç seviyen: **A2**." Altında belirsizlik cümlesi, ör. "Bu sonuçtan %93 eminiz."
- **Güçlü yanların:** güçlü kanıtı olan konular.
- **Netleştireceğimiz konular:** kanıtın karışık olduğu konular.
- **Zayıf nokta yalnızca kanıt varsa** gösterilir: öğrencinin o konuda yanlış cevabı olmalı ve sonsal ustalık olasılığı düşük olmalı. Kanıt yoksa kart çıkmaz. "Her zaman 3 konu" kuralı kalkar; bu bir PRD F2 değişikliği.

---

## 6. Kapsam kapısı (A2 üstü)

**Yerleştirmede kapı.** Kural: P(B1+) ≥ 0,9. Bu olasılık 0,6 ile 0,9 arasındaysa önce uzatma bloğu uygulanır. Ekran metni ("sen" dili; pedagoji sahibi düzenler):

> **İngilizcen şu an bizim seviyelerimizin üstünde görünüyor.**
> Kaynak şimdilik A1–A2 öğrencileri için çalışıyor; sana zaten bildiğin konuları çalıştırmak istemiyoruz. B1 ve üstü için hazırlanıyoruz.
> **[Hazır olunca bana haber ver]**   [Sonucun yanlış olduğunu düşünüyorum]

**Oturumlarda sürekli kapı.** Öğrenen modelinde iki koşul birlikte sağlanırsa kapı açılır: P(θ_genel ≥ A2|B1) ≥ 0,95 ve A2 konu hücrelerinin en az %90'ı "sağlam". Bu durumda "A2'yi tamamladın" ekranı gösterilir (aynı bekleme listesi akışı). Ek kanıt olarak serbest üretimde doğru kullanılan B1 kriter yapıları da toplanır [27]: değerlendirme şemasına önerilen `advanced_evidence` alanı.

**Asimetrik maliyet.** A2 bir öğrenciyi dışlamak, sınırdaki bir B1 öğrenciye A2 içeriği vermekten çok daha pahalı. Bu yüzden:
- Kapı yüksek eşikle çalışır.
- Sınırdaki öğrenci hizmet almaya devam eder ve sürekli kapı onu izler.
- İtiraz düğmesi tek seferlik yeniden test (ör. 7 gün sonra) ya da yönetim panelinden öğretmen kararı açar.

**Veri.** `profiles.scope_status` (`in_scope | above_scope | graduated`) ve `profiles.notify_opt_in_at`. E-posta Google hesabında zaten var, ayrıca toplanmaz. KVKK aydınlatma metnine bir cümle eklenir.

**Ölçüm.** Kapıdan geçemeyen kişilerden bir örneklemle pedagoji sahibi kısa bir görüşme yapar. Hedef: yanlış dışlama ≤ %2 (Bölüm 9).

---

## 7. Öğrenen modeli v2 ("öğrenme profili")

### 7.1 Model

```text
η = θ_genel + s_beceri + d_konu + e_konu×beceri − b_konu − b_tür
P(doğru) = c_tür + (d − c_tür) · σ(a_tür · η)
```

| Terim | Anlamı | Önsel |
| --- | --- | --- |
| `θ_genel` | Genel seviye | Yerleştirmenin sonsal dağılımı: N(μ, σ²) |
| `s_beceri` | Beceri profili ("dinlemesi genelinden zayıf" gibi) | N(0; 0,4²) |
| `d_konu` | Konuya özgü bilgi farkı → **konu eksiği** | N(önkoşul katkısı; 0,6²) |
| `e_konu×beceri` | "Konuyu biliyor ama bu beceride kullanamıyor" → **beceri eksiği** | N(0; 0,4²) |
| `b_konu`, `b_tür` | Konu ve etkinlik türü zorlukları | Başlangıç değeri uzmandan, sonra gece kalibrasyonuyla |

- Ürünün ana sorusu, "hatanın kaynağı konu mu, beceri mi?", bu yapının içinde doğrudan iki terimle temsil ediliyor: `d_konu` ve `e_konu×beceri`.
- Yerleştirme sonucu `θ_genel`'i belirler. Bu yüzden B2 bir öğrencinin hiç sorulmamış A1 konuları da ilk günden "büyük olasılıkla sağlam (tahmini)" görünür. "Kanıt yokluğu = zayıflık" hatası ortadan kalkar.
- **Önkoşul grafiği.** `topics.prereqs` zaten var. İleri bir konuda sağlamlık, önkoşulları için yumuşak pozitif kanıttır. KST'nin [25] hafif bir uyarlaması.

### 7.2 Çevrimiçi güncelleme

- Her cevaptan sonra **varsayılan yoğunluk filtrelemesi** (ADF, moment eşleme) uygulanır. Tek boyutlu Gauss–Hermite integrali alınır, sonra ortalama ve kovaryans kapalı formda, birinci dereceden (rank-1) güncellenir. Bu, TrueSkill ve Glicko'daki güncellemenin aynısıdır [32, 55, 56]. Formüller Ek B'de.
- Boyut yaklaşık 155 (1 + 4 + 30 + 120). Cevap başına yaklaşık 25 bin çarpma, yani 1 ms'den az.
- **Kanıt ağırlıkları:**
  - Serbest cevaplarda kısmi puan kesirli olabilirlik olarak girer.
  - Dil modeliyle değerlendirilen kanıt, değerlendirmenin güveniyle ağırlıklandırılır (olabilirliğin üssü w ∈ [0, 1]).
  - Yan kanıt (serbest üretimde doğru kullanılan konu) w = 0,5 ile girer.
  - İpucu kullanılmışsa w = 0,5 (bugünkü "en çok 0,5" kuralının karşılığı).
- **"Tek cevap ustalığı en çok 0,25 değiştirir" kuralı** (PRD F7) yeni modelde zaten doğal olarak sağlanır: kanıt biriktikçe tek cevabın etkisi küçülür. Yine de bir güvenlik sınırı konabilir.

### 7.3 Etiketler: "kanıt yoksa hüküm yok"

| Etiket | Kural | Izgarada |
| --- | --- | --- |
| Sağlam | P(ustalık) ≥ 0,8 | Yeşil; kanıt yoksa taralı yeşil ("tahmini") |
| Çalışılacak | P(ustalık) ≤ 0,2 **ve** konuda en az 2 doğrudan cevap | Kırmızı |
| Gelişiyor | Sonsal dar ve arada | Sarı |
| Henüz ölçülmedi | Sonsal geniş | Gri; tahmin yönü küçük işaretle |

- Burada "ustalık", kontrollü bir maddeyi doğru cevaplama olasılığının ≥ 0,8 olmasıdır. Eşiği pedagoji sahibi belirler.
- Eşikler `app_settings`'te tutulur.

### 7.4 Teşhis: konu mu beceri mi?

Teşhis, sabit eşiklerle değil, **sonsal olasılıkla** yapılır:

| Teşhis | Koşul |
| --- | --- |
| `topic_gap` | P(d_konu < −0,5) ≥ 0,9 ve konuda en az 4 cevap |
| `skill_gap` | P(e_konu,k < −0,5) ≥ 0,9, başka bir k′ becerisinde P(ustalık) ≥ 0,7 ve k becerisinde en az 2 cevap |
| `activity_mismatch` | (İsteğe bağlı) öğrenci × tür sapma terimi eklenir; aynı mantık |

- Gösterilen güven, sonsal olasılığın kendisi. Kalibre edildiği için "%90 eminiz" gerçekten 10'da 9 doğru çıkmalı; bunu pilotta ölçeriz (Bölüm 9).
- Mesaj şablonları aynı kalır; beceri başına doğru/toplam sayıları göstermeye devam eder (PRD F8).

### 7.5 Planlayıcı (SPEC 4.4'ün yapısı korunur, girdisi değişir)

- **Açık konular:** önkoşulları büyük olasılıkla sağlam olan ve kendisi sağlam olmayan konular; yakınsal gelişim alanı. `level_est`'e bağlı sert A1/A2 süzgeci yumuşar.
- **Odak:** `P(ustalık değil) × P(önkoşul hazır) × (1 + L1 riski katkısı)` değerini en büyük yapan konu.
- **Doğrulama sondası (yeni):** bir konuda k becerisinde hata olursa, aynı konu bir sonraki oturumda başka bir k′ becerisiyle sorulur. Kaynak konu mu beceri mi, en hızlı böyle ayrılır.
- **Tekrar:** modelin unutma bileşeni (7.6), P(ustalık) değerinin 0,8'in altına düşeceği zamanı tahmin eder. Sabit 1/3/7/14 günlük aralıkların yerine bu tarih kullanılır.
- **Gereksiz soru yok:** P(ustalık) ≥ 0,95 olan hücreye, tekrar vakti gelmedikçe etkinlik verilmez. Güçlü öğrenciye am / is / are sorulmaz.
- Simülasyonun dersi: saf belirsizlik örneklemesi başarısız oldu (3.4). Planlayıcı değişikliği simülasyon testinden geçmeden devreye alınmaz.

### 7.6 Zaman: unutma ve öğrenme

- Oturumlar arasında süreç gürültüsü eklenir: `σ² += q × Δgün`. Eski kanıt zamanla ağırlık kaybeder (Glicko'daki sapma artışı gibi) ve model öğrenmeyi takip edebilir.
- `q` değerleri bileşen başına tutulur; başlangıçta küçük seçilir (simülasyon: konu için 0,003, genel seviye için 0,002) ve gece kalibre edilir.
- v2'de DAS3H tarzı uygulama geçmişi özellikleri eklenebilir [44].

### 7.7 Sistemin kendi öğrenmesi: kalibrasyon

**Gece işi** (`app/api/cron/daily` zaten var) tüm `attempts` üzerinden şunları yeniden tahmin eder:
- konu ve etkinlik türü zorlukları,
- yerleştirme madde parametreleri,
- τ ve q değerleri.

Başlangıç yöntemi TypeScript'te beklenti-maksimizasyonu (EM) ya da en büyük sonsal kestirim (MAP). Python/Stan bir v2 seçeneği.

**İzleme.** Yönetim panelinde kalibrasyon eğrisi (tahmin edilen ve gerçekleşen doğru oranı), sonraki cevabı tahmin AUC'si ve log-loss gösterilir [43].

**Model sürümü** (`app_settings.learner_model_version`) değişirse tüm cevaplar yeniden oynatılır (olay kaynaklı yapı). Mevcut pilot öğrencilerin profili de böyle kurulur.

### 7.8 Mühendislik

**Yeni saf modüller** (`lib/engine/*`, veritabanı ve `Date.now()` yok):
- `irt.ts`: 4PL, bilgi fonksiyonu, ızgara sonsalı.
- `placement-cat.ts`: madde seçimi ve durma.
- `learner-model.ts`: ADF güncellemesi, etiketler, teşhis.

**Durum.** Öğrenen modelinin durumu `attempts` ve `items` tablolarından **yeniden oynatılarak** kurulabilir. Pilot ölçeğinde (1000'den az cevap) bu birkaç on milisaniye sürer. Performans için `learner_state` önbellek tablosu önerilir: `mu` ve `sigma` paketlenmiş hâlde, kişi başı yaklaşık 50 KB.

**Geriye uyum.** `mastery` tablosu türetilmiş bir görünüm olarak kalır: `score = P(ustalık)`, `n` = doğrudan kanıt sayısı. İlerleme ekranı küçük değişiklikle çalışmaya devam eder.

**Ayarlar** `app_settings`'te tutulur, koda sabit yazılmaz. Önerilen anahtarlar: `placement_model`, `learner_model`, `grade_samples`.

---

## 8. Değerlendirme hassasiyeti: yanlış pozitifi ölçmek ve düşürmek

### 8.1 Komut ilkeleri (`lib/ai/prompts/grade.ts` için öneri)

1. **Varsayılan: cevap doğru.** Hata yalnızca dikkatli bir İngilizce öğretmeninin standart İngilizcede yanlış sayacağı şeydir. Daha doğal söyleyiş, üslup ya da kelime tercihi hata sayılmaz. Bunlar isteğe bağlı "daha doğal" önerisi olarak verilebilir ama ustalığa işlenmez.
2. **Her hata için ek bilgi:** `confidence` (`high | medium | low`) ve `in_scope` (hata konu listesinde mi?) alanları istenir.
3. **Seviye kapsamı.** Doğru kullanılmış A2 üstü yapılar `advanced_evidence` alanına yazılır; kapı bu kanıtı kullanır. Kapsam dışı hatalar kaydedilir ama öğretme kararına girmez.
4. Şema değişikliği istem önbelleğini bozar (`.claude/rules/ai-katmani.md`). Bu yüzden değişiklikler tek seferde yapılır.

### 8.2 Kendi kendine tutarlılık: düzeltme düzeyinde çoğunluk oyu

- Değerlendirme k = 3 kez paralel çalıştırılır (`effort = low`). Yalnızca en az 2/3'ünde bulunan hata sayılır [49].
- Gecikme değişmez, çünkü çağrılar paralel.
- Maliyet: yalnızca serbest cevap değerlendirme çağrıları üç katına çıkar. Bugün değerlendirme çağrısı başına yaklaşık 0,0007 $ (SPEC değişiklik günlüğü). Oturumda 2–3 serbest cevap varsa oturum başına yaklaşık +0,003–0,004 $. `guard.ts` bütçe tavanı içinde kalır, ama `app_settings` ile yönetilebilir olmalı (`grade_samples`).
- **Kanıt ağırlığı:** çoğunluğun onayladığı yüksek güvenli hatanın tam ağırlığı var. Diğerlerinin ustalık ağırlığı 0; yine de öğretmen kuyruğu için kaydedilir.

### 8.3 Kontrol seti ve ölçüt

**Önerilen yeni betik: `scripts/eval-grading-precision.ts`.** Gerçek API çağırdığı için çalıştırmadan önce tahmini maliyet sorulur.

**Veri** (yaklaşık 200 cevap):
- Anadil ve ileri düzey kişilerin gerçek görev komutlarına verdiği cevaplar. Pedagoji sahibi yazar ve onaylar; dil modeli taslak üretebilir.
- Mevcut altın setteki öğrenci hataları (`docs/pedagoji/altin-set.csv`).

**Ölçütler ve hedefler:**
- Hatasız cevapta yanlış pozitif oranı: **≤ %2**.
- Altın sette kesinlik, duyarlılık ve F0.5 [50].
- Her komut değişikliğinde yeniden çalıştırılır.

Öğretmen inceleme kuyruğu (F11) bu sete sürekli altın etiket sağlar.

---

## 9. Doğrulama planı ve başarı ölçütleri

| Bileşen | Pilot öncesi (simülasyon ve küçük insan çalışması) | Pilot boyunca |
| --- | --- | --- |
| Yerleştirme | Kalibre banka simülasyonunda doğruluk ≥ %90, ortalama ≤ 18 madde, yanlış dışlama ≤ %2. **Bilinen seviyeli 12–15 kişi** (en az 3 B1/B2 ve 2 anadil konuşuru dahil): bütün B1+ ve anadil konuşurları kapıda; hiçbir A2 kapıda değil | Pedagoji sahibinin değerlendirmesiyle uyum; test–tekrar test tutarlılığı (10 kişi); ortalama süre |
| Kapı | Yukarıdaki insan çalışması | Kapıdan geçemeyenlerle örneklem görüşmesi; itiraz oranı |
| Öğrenen modeli | Simülasyon: B1/B2'de yanlış "zayıf" = 0; A2'de eklenmiş boşlukların ≥ %60'ı 20. oturuma kadar bulunmuş, isabet ≥ %90; mevcut pilot verisi yeniden oynatılır | Sonraki cevabı tahmin: AUC, log-loss, kalibrasyon eğrisi (haftalık); teşhislerin öğretmen etiketiyle uyumu ≥ %80 (SCOPE v2 tetiği); "Bence değil" oranı |
| Değerlendirme | Kontrol setinde yanlış pozitif ≤ %2 | Öğretmen kuyruğunda "yanlış hata" oranı |

**Gölge mod.** Yeni model bir hafta boyunca eskisinin yanında hesaplanır ve karşılaştırılır; arayüz ancak sonra değiştirilir.

---

## 10. Uygulama yol haritası (öneri)

Önce bir tercih gerekiyor: Aşama 0'daki acil yamalar mı, yoksa doğrudan M11–M15 mi? Bölüm 12, soru 8.

### Aşama 0: acil yamalar (isteğe bağlı, 1–2 gün)

Tam sistem gelene kadar en görünür zararı durdurmak için. Hepsi SPEC ve PRD değişikliği gerektiriyor.

- `weakPoints` yalnızca yanlış cevaplanan konuları gösterir. Hiç yanlış yoksa "Güçlü yanların" kartı çıkar.
- Önsel değer yerleştirme sonucuyla yükseltilir. Örnek: başarı %90 ve üstüyse A1 konuları 0,6'dan başlar. Ayrıca "zayıf" bandı için n ≥ 2 ve en az bir yanlış cevap şart koşulur.
- Kapı yaması: `placement.json`'a pedagoji sahibinin yazacağı 6 B1 maddesi eklenir. Kural: çekirdek maddelerde en az 12/14 ve B1 maddelerinde en az 5/6 doğru → kapı.
- Değerlendirme komutuna "varsayılan doğru, üslup hata değildir" satırı eklenir.

### M11: Ölçek ve madde bankası (pedagoji ağırlıklı)

- Kesim noktalarının ilk tanımı ve `topics.irt_b` sütunu.
- 150'den fazla maddelik yerleştirme bankası: dil modeli taslak üretir, pedagoji sahibi onaylar ve sıralar.
- Simülasyonun TypeScript'e taşınması: `scripts/sim-placement.ts`.
- **Bitti testi:** her seviyede en az 25 madde; her kesim noktasında bankanın test bilgisi yeterli; simülasyonda en çok 18 maddeyle %90 doğruluk; pedagoji onayı.

### M12: Uyarlamalı yerleştirme ve kapsam kapısı

- `lib/engine/irt.ts` ve `lib/engine/placement-cat.ts`.
- Yerleştirme akışı madde madde ilerler: önceden üretilmiş tüm maddeler yerine "sonraki madde" uç noktası.
- Kapı ekranı, `scope_status`, bekleme listesi bayrağı.
- `PlacementSummary` yeniden yazılır.
- **Bitti testi:** Vitest'te 4PL, sonsal, durma ve kapı birim testleri; sızıntı testi (madde anahtarı yanıtta yok); 3 kişiyle (A1, A2, B2 ya da anadil konuşuru) elle deneme; davetten ilk etkinliğe 10 dakikadan kısa (PRD F2).

### M13: Öğrenen modeli v2

- `lib/engine/learner-model.ts`; olay kaynaklı yeniden oynatma; `learner_state` önbelleği.
- `mastery` türetilmiş tablo olarak kalır.
- İlerleme ızgarasında "tahmini" durumu.
- Teşhis sonsaldan; planlayıcıya doğrulama sondası; sürekli kapı.
- **Bitti testi:** Bölüm 9'daki simülasyon ölçütleri; mevcut pilot verisinin yeniden oynatılması; F8'deki "ilk güvenli teşhis en geç 5. oturumda" ölçütünün simülasyonla yeniden doğrulanması.

### M14: Değerlendirme hassasiyeti

- Komut v2, `grade_samples` ile çoğunluk oyu, kanıt ağırlıkları.
- `eval-grading-precision` betiği ve kontrol seti.
- **Bitti testi:** kontrol setinde yanlış pozitif ≤ %2; altın sette F0.5 en az bugünkü kadar.

### M15: Kalibrasyon hattı ve izleme

- Gece kalibrasyonu ve model sürümleme.
- Yönetim panelinde kalibrasyon ve AUC grafikleri.
- **Bitti testi:** sentetik veride gerçek parametrelerin geri kazanılması; panelde haftalık rapor.

Kabaca sıra: M11 ile M14 paralel yürür; M12 ve M13 M11'den sonra gelir; M15 pilotun ilk haftalarında devreye girer.

---

## 11. Belgelere önerilen değişiklikler (uygulanmadı)

| Belge | Bölüm | Öneri |
| --- | --- | --- |
| SPEC | §3 `profiles` | `scope_status`, `notify_opt_in_at`; `level_est` A1/A2 olarak kalır (içerik seviyesi), kapsam durumu ayrı alanda |
| SPEC | §3 yeni tablolar | `placement_items` (ya da `placement.json` + `item_calibration`: a, b, n, `updated_at`; yalnızca admin); `learner_state` (sahibi okur, yazma servis istemcisiyle); RLS her yeni tabloda |
| SPEC | §3 `topics` | `irt_b` sütunu |
| SPEC | §3 `app_settings` | `placement_model`, `learner_model`, `learner_model_version`, `grade_samples` |
| SPEC | §4.1–4.3 | EMA ve sabit eşikli teşhis yerine hiyerarşik Bayesçi model, sonsal temelli etiketler ve teşhis |
| SPEC | §4.4 | `level_est` kuralı ve açık konular (önkoşul ve olasılık temelli) |
| SPEC | yeni §4.7, §4.8 | Uyarlamalı yerleştirme; kapsam kapısı |
| SPEC | §5.1–5.2 | Değerlendirme şemasına `confidence`, `in_scope`, `advanced_evidence`; k örnekli değerlendirme |
| SPEC | Ek C | 14 sabit soru yerine banka tanımı |
| PRD | F2 | Uyarlamalı test; "3 konu" yerine kanıta dayalı zayıf nokta; kapı |
| PRD | F7 | Teşhis kuralları sonsal temelli; "en çok 0,25" kuralı güvenlik sınırı olarak |
| PRD | F9 | Izgarada "tahmini" durumu |
| PRD | yeni F15 | Kapsam kapısı ve bekleme listesi |
| SCOPE | §2 | Yeni M maddeleri (M11–M15). v2 havuzu: kelime tarayıcısı, cevap süresi puanlaması, sinir ağı tabanlı bilgi izleme |
| ROADMAP | — | M11–M15 ve "Pilot başlatma kapısı"na yerleştirme ve kapı doğrulaması |

---

## 12. Karar bekleyen sorular

1. **Sınıflar:** A1 / A2 / B1+ yeterli mi? Planlayıcı için A1 ve A2'yi alt/üst diye ikiye bölmek faydalı olabilir.
2. **Yerleştirme süresi:** ortalama 14–19 madde (yaklaşık 8–10 dakika; en çok 25) kabul mü? Bugünkü test 14 madde ve yaklaşık 7 dakika.
3. **Kapı:** Eşik P ≥ 0,9, yanlış dışlama hedefi ≤ %2 ve 7 gün sonra tek yeniden test hakkı uygun mu?
4. **Bekleme listesi:** Bildirim izni için KVKK aydınlatma metni güncellemesi gerekiyor. E-posta Google hesabından alınacak.
5. **B1/B2 ölçme maddeleri:** Dil modeli taslak, pedagoji sahibi onay ve sıralama yapsın mı? Pedagoji emeğinin tahmini: 150 madde için 2–3 gün.
6. **Değerlendirmede 3 örnekli çoğunluk oyu:** Değerlendirme maliyeti yaklaşık 3 katına çıkar (oturum başına yaklaşık +0,003–0,004 $). Onay?
7. **Konuşma maddesi** yerleştirmede kapıya ne kadar katkı versin? Önerim: yalnızca destekleyici kanıt; tek başına karar vermesin.
8. **Sıralama:** Aşama 0 yamaları şimdi mi yapılsın, yoksa doğrudan M11–M13'e mi geçilsin? Önerim: pilot başlamadıysa doğrudan M11–M13. Başladıysa önce Aşama 0.
9. **Mevcut pilot kullanıcıları:** Yeni modele geçişte cevapları yeniden oynatılarak profilleri kurulsun mu? B1+ çıkanlar kapıya düşebilir. Bu kişilere nasıl bir iletişim yapılacak?

---

## Kaynakça

1. Weiss, D. J. (1973). *The stratified adaptive computerized ability test* (RR 73-3). University of Minnesota. Özet: [IACAT, Introduction to CAT](https://iacat.org/introduction-to-cat/)
2. Levitt, H. (1971). Transformed up-down methods in psychoacoustics. *JASA*, 49(2B), 467–477.
3. Watson, A. B., & Pelli, D. G. (1983). QUEST: A Bayesian adaptive psychometric method. *Perception & Psychophysics*, 33(2), 113–120.
4. Kontsevich, L. L., & Tyler, C. W. (1999). Bayesian adaptive estimation of psychometric slope and threshold. *Vision Research*, 39(16), 2729–2737.
5. Lord, F. M. (1980). *Applications of item response theory to practical testing problems.* Erlbaum.
6. Weiss, D. J., & Kingsbury, G. G. (1984). Application of computerized adaptive testing to educational problems. *Journal of Educational Measurement*, 21(4), 361–375.
7. Barton, M. A., & Lord, F. M. (1981). *An upper asymptote for the three-parameter logistic item-response model* (ETS RR-81-20).
8. Wald, A. (1947). *Sequential analysis.* Wiley.
9. Reckase, M. D. (1983). A procedure for decision making using tailored testing. In D. J. Weiss (Ed.), *New horizons in testing.* Academic Press.
10. Spray, J. A., & Reckase, M. D. (1996). Comparison of SPRT and sequential Bayes procedures for classifying examinees into two categories using a computerized test. *JEBS*, 21(4), 405–414. [doi:10.3102/10769986021004405](https://doi.org/10.3102/10769986021004405)
11. Eggen, T. J. H. M. (1999). Item selection in adaptive testing with the sequential probability ratio test. *Applied Psychological Measurement*, 23(3), 249–261. [Cito raporu (1998)](https://cito.nl/media/j5tczwrk/1998-item-selection-in-adaptive-testing-with-the-sequential-probability-ratio-test.pdf)
12. Eggen, T. J. H. M., & Straetmans, G. J. J. M. (2000). Computerized adaptive testing for classifying examinees into three categories. *Educational and Psychological Measurement*, 60(5), 713–734. [ERIC EJ617258](https://eric.ed.gov/?id=EJ617258)
13. Thompson, N. A. (2011). Termination criteria for computerized classification testing. *PARE*, 16(4). [Bağlantı](https://openpublishing.library.umass.edu/pare/article/id/1450)
14. Huebner, A., & Fina, A. D. (2015). The stochastically curtailed generalized likelihood ratio. *Behavior Research Methods*. [Bağlantı](https://link.springer.com/10.3758/s13428-014-0490-y)
15. Lewis, C., & Sheehan, K. (1990). Using Bayesian decision theory to design a computerized mastery test. *Applied Psychological Measurement*, 14(4), 367–386.
16. Settles, B., LaFlair, G. T., & Hagiwara, M. (2020). Machine learning–driven language assessment. *TACL*, 8, 247–263. [ACL Anthology](https://aclanthology.org/2020.tacl-1.17)
17. Duolingo English Test, *Technical Manual*. [PDF (yansı)](https://www.peb.ufrj.br/images/documentos/DET-technical_manual-V01.pdf)
18. Huibregtse, I., Admiraal, W., & Meara, P. (2002). Scores on a yes–no vocabulary test: correction for guessing and response style. *Language Testing*, 19(3), 227–245.
19. Milton, J., & Alexiou, T. (2009). Vocabulary size and the CEFR (GALA 14 bildirisi). [PDF](https://www.enl.auth.gr/gala/14th/Papers/English%20papers/Milton&Alexiou.pdf)
20. Lemhöfer, K., & Broersma, M. (2012). Introducing LexTALE. *Behavior Research Methods*, 44(2), 325–343. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC3356522)
21. Puig-Mayenco, E., vd. (2023). The LexTALE as a measure of L2 global proficiency: a cautionary tale. *Linguistic Approaches to Bilingualism*. [Bağlantı](https://research.polyu.edu.hk/en/publications/the-lextale-as-a-measure-of-l2-global-proficiency-a-cautionary-ta/)
22. Yan, X., Maeda, Y., Lv, J., & Ginther, A. (2016). Elicited imitation as a measure of second language proficiency: A narrative review and meta-analysis. *Language Testing*, 33(4), 497–528.
23. Kostromitina, M., & Plonsky, L. (2022). Elicited imitation tasks as a measure of L2 proficiency: A meta-analysis. *SSLA*, 44(3), 886–911. [Cambridge](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/elicited-imitation-tasks-as-a-measure-of-l2-proficiency/C52297B9096EF1DA34FA28639242E3ED)
24. Matayoshi, J., vd. (2024). An evaluation of a placement assessment for an adaptive learning system. *EDM 2024*. [Bildiri](https://educationaldatamining.org/edm2024/proceedings/2024.EDM-industry.61/index.html)
25. Doignon, J.-P., & Falmagne, J.-C. (1985). Spaces for the assessment of knowledge. *Int. J. Man-Machine Studies*, 23, 175–196; Falmagne, J.-C., & Doignon, J.-P. (2011). *Learning Spaces.* Springer.
26. Pearson, *Global Scale of English* white paper. [PDF](https://www.pearson.com/content/dam/one-dot-com/one-dot-com/english/TeacherResources/GSE/GSE-WhitePaper-Developing-LOs.pdf)
27. Hawkins, J. A., & Filipović, L. (2012). *Criterial Features in L2 English.* Cambridge University Press.
28. Ross, S. (1998). Self-assessment in second language testing: a meta-analysis and analysis of experiential factors. *Language Testing*, 15(1), 1–20.
29. Li, M., & Zhang, X. (2021). A meta-analysis of self-assessment and language performance in language testing and assessment. *Language Testing*. [Veri](https://sage.figshare.com/collections/A_meta-analysis_of_self-assessment_and_language_performance_in_language_testing_and_assessment/5021492)
30. Elo, A. E. (1978). *The rating of chessplayers, past and present.* Arco.
31. Glickman, M. E. (1999). Parameter estimation in large dynamic paired comparison experiments. *Applied Statistics*, 48(3), 377–394.
32. Herbrich, R., Minka, T., & Graepel, T. (2006). TrueSkill: A Bayesian skill rating system. *NIPS 19*.
33. Klinkenberg, S., Straatemeier, M., & van der Maas, H. L. J. (2011). Computer adaptive practice of Maths ability using a new item response model for on the fly ability and difficulty estimation. *Computers & Education*, 57(2), 1813–1824.
34. Pelánek, R. (2016). Applications of the Elo rating system in adaptive educational systems. *Computers & Education*, 98, 169–179. [PDF](https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf)
35. Papoušek, J., Pelánek, R., & Stanislav, V. (2014). Adaptive practice of facts in domains with varied prior knowledge. *EDM 2014*. [PDF](https://www.fi.muni.cz/~xpelanek/publications/EDM14-adaptive-facts.pdf)
36. Pelánek, R., Papoušek, J., Řihák, J., Stanislav, V., & Nižnan, J. (2017). Elo-based learner modeling for the adaptive practice of facts. *UMUAI*. [doi:10.1007/s11257-016-9185-7](https://doi.org/10.1007/s11257-016-9185-7)
37. Hofman, A. D., vd. (2020). Tracking with (un)certainty. *Journal of Intelligence*, 8(1), 10. [DOAJ](https://doaj.org/article/5606408e805f4900894a518c474fe254)
38. Bolsinova, M., Maris, G., Hofman, A. D., van der Maas, H. L. J., & Brinkhuis, M. J. S. (2022). Urnings: A new method for tracking dynamically changing parameters in paired comparison systems. *JRSS-C*, 71(1), 91–118. [Bağlantı](https://research.tilburguniversity.edu/en/publications/urnings-a-new-method-for-tracking-dynamically-changing-parameters/)
39. Corbett, A. T., & Anderson, J. R. (1995). Knowledge tracing: Modeling the acquisition of procedural knowledge. *UMUAI*, 4, 253–278.
40. Pardos, Z. A., & Heffernan, N. T. (2010). Modeling individualization in a Bayesian networks implementation of knowledge tracing. *UMAP 2010*, 255–266. [Bağlantı](https://www.ischool.berkeley.edu/research/publications/2010/modeling-individualization-bayesian-networks-implementation-knowledge)
41. Wilson, K. H., Karklin, Y., Han, B., & Ekanadham, C. (2016). Back to the basics: Bayesian extensions of IRT outperform neural networks for proficiency estimation. *EDM 2016*. [arXiv:1604.02336](https://arxiv.org/abs/1604.02336)
42. Khajah, M., Lindsey, R. V., & Mozer, M. C. (2016). How deep is knowledge tracing? *EDM 2016*. [arXiv:1604.02416](https://arxiv.org/abs/1604.02416)
43. Gervet, T., Koedinger, K., Schneider, J., & Mitchell, T. (2020). When is deep learning the best approach to knowledge tracing? *JEDM*, 12(3), 31–54. [JEDM](https://jedm.educationaldatamining.org/index.php/JEDM/article/view/451)
44. Choffin, B., Popineau, F., Bourda, Y., & Vie, J.-J. (2019). DAS3H: Modeling student learning and forgetting for optimally scheduling distributed practice of skills. *EDM 2019*. [arXiv:1905.06873](https://arxiv.org/abs/1905.06873)
45. Duolingo (2020). Learning how to help you learn: Introducing Birdbrain. [Blog](https://blog.duolingo.com/learning-how-to-help-you-learn-introducing-birdbrain); [IEEE Spectrum](https://spectrum.ieee.org/duolingo)
46. Fang, T., vd. (2023). Is ChatGPT a highly fluent grammatical error correction system? A comprehensive evaluation. [arXiv:2304.01746](https://arxiv.org/abs/2304.01746)
47. Coyne, S., Sakaguchi, K., Galvan-Sosa, D., Zock, M., & Inui, K. (2023). Analyzing the performance of GPT-3.5 and GPT-4 in grammatical error correction. [arXiv:2303.14342](https://arxiv.org/abs/2303.14342)
48. Penteado, M. C., & Perez, F. (2023). Evaluating GPT-3.5 and GPT-4 on grammatical error correction for Brazilian Portuguese. [arXiv:2306.15788](https://arxiv.org/abs/2306.15788)
49. Goto, T., Sakai, Y., & Watanabe, T. (2026). Edit-level majority voting mitigates over-correction in LLM-based grammatical error correction. [arXiv:2605.13624](https://arxiv.org/abs/2605.13624)
50. Ng, H. T., vd. (2014). The CoNLL-2014 shared task on grammatical error correction. *CoNLL 2014* (F0.5 ölçütü).
51. Yancey, K. P., LaFlair, G., Verardi, A., & Burstein, J. (2023). Rating short L2 essays on the CEFR scale with GPT-4. *BEA 2023*. [ACL Anthology](https://aclanthology.org/2023.bea-1.49)
52. Linacre, J. M. (1994). Sample size and item calibration stability. *Rasch Measurement Transactions*, 7(4), 328. [rasch.org](https://www.rasch.org/rmt/rmt74m.htm)
53. Fischer, G. H. (1973). The linear logistic test model as an instrument in educational research. *Acta Psychologica*, 37, 359–374.
54. Ormerod, C. (2026). Reconstructing item characteristic curves using fine-tuned large language models. [arXiv:2601.02580](https://arxiv.org/abs/2601.02580)
55. Opper, M. (1998). A Bayesian approach to on-line learning. In D. Saad (Ed.), *On-line Learning in Neural Networks.* Cambridge University Press.
56. Minka, T. P. (2001). Expectation propagation for approximate Bayesian inference. *UAI 2001*.
57. Council of Europe (2020). *CEFR Companion Volume.*
58. Maris, G., & van der Maas, H. L. J. (2012). Speed-accuracy response models: Scoring rules based on response time and accuracy. *Psychometrika*, 77(4), 615–633.
59. McGraw Hill ALEKS, *Shorter, smarter knowledge checks.* [PDF](https://www.mheducation.com/content/dam/mhe/highered/documents/aleks/innovation-shorter-smarter-knowledge-checks.pdf)

> Kaynakların bir kısmı tam metinden değil, özet ve dizin kayıtlarından doğrulandı. Sayısal iddialar yalnızca doğrulanabilen özetlerden alındı. arXiv bu oturumun ağ ayarlarında açık olmadığı için arXiv makaleleri arama özetleriyle doğrulandı.

---

## Ek A: Simülasyonları yeniden çalıştırma

Depo kökünden çalıştırılır. Ağ ve API çağrısı yok, para harcamaz. Python betikleri `numpy` ister.

```bash
npx tsx docs/arastirma/sim/mevcut_motor.ts 0.97 40 20
```

```bash
python3 docs/arastirma/sim/yerlestirme.py 3000
```

```bash
python3 docs/arastirma/sim/yerlestirme_egri.py 1500
```

```bash
python3 docs/arastirma/sim/ogrenen_modeli.py 60 product
```

- `mevcut_motor.ts` mevcut motoru gerçek kodla çalıştırır: 14/14 yerleştirme ve %97 doğru cevapla 40 oturum.
- `ogrenen_modeli.py` için politika seçenekleri `product`, `random` ve `uncertainty`. `A_HAT=1.3` ortam değişkeni modele gerçek ayırt ediciliği verir.
- Çıktılar `docs/arastirma/sim/sonuclar/` klasöründe.

## Ek B: Formüller

**4PL:**

`P_j(θ) = c_j + (d_j − c_j) / (1 + exp(−a_j (θ − b_j)))`

**Madde bilgisi:**

`I_j(θ) = a_j² (P − c)² (d − P)² / ((d − c)² P (1 − P))`

**Sonsal (ızgara üzerinde):**

`log π(θ | x) = log π0(θ) + Σ_j [x_j log P_j(θ) + (1 − x_j) log(1 − P_j(θ))]`

Sınıf olasılığı `P(k) = Σ_{θ ∈ sınıf k} π(θ | x)`.

**Madde seçimi (BCCT):**

`j* = argmin_j [ p_j · H(sınıf | x, 1) + (1 − p_j) · H(sınıf | x, 0) ]`

Burada `p_j = Σ_θ π(θ | x) P_j(θ)` maddenin doğru cevaplanma olasılığı ve H entropidir.

**Öğrenen modeli, ADF güncellemesi.** Gizil vektör z ~ N(μ, Σ) ve bir gözlem için w ağırlık vektörü olsun (η = wᵀz − β).

1. Önsel moment: `m = wᵀμ − β`, `v = wᵀΣw`.
2. Gauss–Hermite ile sonsal momentleri hesapla: `Z = Σ_i ω_i ℓ(η_i)`, `m′ = Σ_i ω_i ℓ(η_i) η_i / Z`, `v′ = Σ_i ω_i ℓ(η_i) η_i² / Z − m′²`. Burada `η_i = m + √(2v) x_i`.
3. Güncelle: `μ ← μ + Σw (m′ − m) / v` ve `Σ ← Σ − (Σw)(Σw)ᵀ (v − v′) / v²`.

**Süreç gürültüsü:** `Σ_ii ← Σ_ii + q_i Δt`.

**Etiket olasılıkları:**

`P(ustalık) = Φ((m − η*) / √v)`, burada `η* = logit(0,8) / a`.
