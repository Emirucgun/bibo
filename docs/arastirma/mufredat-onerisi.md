# Müfredat: araştırma ve tasarım önerisi

> **Durum: ÖNERİ, onay bekliyor (18.11.2026).** `docs/SPEC.md`, `SCOPE.md`, `ROADMAP.md`, `PRD.md` ve `supabase/seed/topics.csv` değiştirilmedi. Konu listesi ve sıralama pedagoji sahibinin alanı; aşağıdaki taslaklar onun ve danışman öğretmenin onayına sunuluyor. Bu belge, `olcme-ve-ogrenen-modeli.md`'deki öneriyi (yerleştirme, kapı, öğrenen modeli) tamamlar.
>
> **Sorular:** Hangi konuyu, hangi sırayla, hangi öğrenciye, ne zaman öğretiyoruz? Okula gitmeyen öğrenci için müfredatı ne belirliyor?

---

## 0. Kısa özet

1. **Bugün açıkça tanımlanmış bir müfredat yok; sırayı fiilen L1 riski belirliyor.** Odak konusu şu formülle seçiliyor: `1 − en düşük ustalık + 0,15 × L1 riski + okul + teşhis`. `topics.csv`'deki sıra ve ön koşullar bu seçimde kullanılmıyor; ön koşullara yalnızca "germe" adımı bakıyor. Gerçek planlayıcıyla 40 oturumluk ölçüm:
   - **A1 öğrencisi:** Geniş zaman (present simple) hiç odak olmuyor. Üçüncü tekil -s ondan önce geliyor. Açık 5 konu (çoğul, geniş zaman, have/has, can, sıklık zarfları) pilot boyunca hiç ele alınmıyor.
   - **A2 öğrencisi:** Present perfect 21. oturumda geliyor; past simple 38. oturumda. Düzensiz geçmiş zaman, going to, will ve modallar dahil 9 konu hiç odak olmuyor.
   - **Ön koşul ihlali:** 20 tohumluk ölçümde ortalama 3,4 (A1) ve 5,6 (A2).
2. **Okul konusu yalnızca bir öncelik bonusu.** Öğrenci her hafta 32 konudan birini kendisi seçiyor. Okula gitmeyen öğrenci için bir yol yok. Okul konusu, öğrencinin henüz hazır olmadığı bir konu da olabilir (ör. past simple bilmeden present perfect); bu durumda köprü kurulmuyor.
3. **Önerilen sistem üç katmanlı:**
   - **Kapsam:** CEFR ve kaynak düzey tanımlarıyla doğrulanmış bir kazanım haritası. Kaynaklar: Core Inventory, English Grammar Profile ve kelime listeleri.
   - **Sıra:** Ön koşul grafiği ve bu grafikten türetilen, ünitelere ayrılmış bir "varsayılan yol".
   - **Seçim:** Öğrencinin modelinden "öğrenmeye hazır" konular çıkarılır. Bunlar arasında iletişimsel değer, yol sırası, okul ve hedef dikkate alınarak seçim yapılır.

   L1 riski artık sırayı belirlemez. Riskli konular daha fazla aralıklı tekrar ve karşılaştırmalı açıklama alır.
4. **Oturum içeriği ve tempo da bilimsel ilkelerle kurulur:**
   - Yeni konu önce bloklu öğretilir, sonra karışabilir konuyla karışık çalışılır (interleaving).
   - Tekrar zamanlaması modelin unutma tahmininden gelir.
   - Oturumlarda dört alan (strand) dengelenir: anlam odaklı girdi, anlam odaklı çıktı, dil odaklı öğrenme ve akıcılık.
   - Uygulama maddelerinde hedef başarı %70–85.
   - Öğrenciye hazır konulardan 2–3 seçenek sunulur.
5. **İki çalışma modu var:**
   - **Okul modu:** Okulun programı (pedagoji sahibi bir kez eşler) haftalık konuyu kendiliğinden getirir; öğrenci tek dokunuşla onaylar. Eksik ön koşul varsa önce köprü kurulur.
   - **Kendi programım:** Okula gitmeyen öğrenci varsayılan yolu ve kendi hedefini izler; uygulama bütün kursun yerini tutar.
6. **İçerik kontrolü ölçülebilir hâle gelir.** Üretilen metinde bilinen kelime oranı en az %95 (A1'de %98) olmalı ve bu kodla denetlenir. Sesletim konuları anlaşılırlığa etkilerine göre önceliklendirilir; buna göre th sesi düşük öncelikli.
7. **Karar gereken sorular Bölüm 8'de.** Önceki belgeden açık kalan kararlar da aynı listede, önerilen varsayılanlarla.

---

## 1. Bugün müfredat nasıl belirleniyor (kod kanıtı)

### 1.1 Kapsam

- `supabase/seed/topics.csv` dosyasında 32 konu var: 30 dilbilgisi konusu (20 A1, 10 A2) ve 2 sesletim algısı konusu (th, w/v). Her konunun `level`, `l1_risk`, `prereqs` ve `sort` alanları var.
- Kelime, işlev ("kendini tanıtabilir" gibi) ve beceri hedefleri tanımlı değil. SPEC Ek A "kelime bilgisi teşhisi v1 kapsamında değildir; kelimeler ilgi alanı içeriğiyle gelir" diyor.
- Üretim komutundaki kelime kuralı tek satır: "Vocabulary within A1–A2" (`lib/ai/prompts/generate.ts`). Kodda kelime düzeyi denetlenmiyor; yalnızca cümle uzunluğu denetleniyor (`lib/ai/checks.ts:15`, A1 için 12, A2 için 16 kelime).

### 1.2 Sıra ve seçim

Odak konusu öncelik formülüyle seçiliyor (`lib/engine/planner.ts:92`):

`1 − en düşük beceri ustalığı + 0,15 × l1_risk + 0,20 × [okul konusu] + 0,10 × [aktif teşhis]`

- Yeni öğrencide bütün konuların önseli `0,50 − 0,15 × l1_risk`. Bu durumda öncelik `0,5 + 0,3 × l1_risk` oluyor: **L1 riski 2 olan bütün konular, diğerlerinden önce geliyor.**
- `sort` alanı yalnızca eşitliği bozuyor. `prereqs` alanı yalnızca "germe" adımında kullanılıyor (`planner.ts`, adım 5).
- Gerçek planlayıcıyla ölçüm. Komut: `npx tsx docs/arastirma/sim/mufredat_mevcut.ts 40 20`. Senaryo: 40 oturum, pratikle başarısı artan öğrenci.

**A1 öğrencisi.** Odak konularının ilk göründüğü oturumlar:

> 1: am/is/are · 3: iyelik sıfatları · 4: özne zamirleri · 8: **üçüncü tekil -s** · 12: in/on/at (zaman) · 13: cümle sırası · 14: do/does · 17: present continuous · 20: wh- soruları · 25: a/an · 26: in/on/at (yer) · 28: nesne zamirleri · 30: the · 33: there is/are · 35: some/any

- 40 oturumda hiç odak olmayan konular: çoğul, **present simple**, have/has, can, sıklık zarfları.
- Örnek ön koşul ihlalleri: iyelik sıfatları özne zamirlerinden önce geliyor; -s takısı, present simple hiç ele alınmadan geliyor.

**A2 öğrencisi.**

> … 19: did ile soru · 21: **present perfect** · 27: present simple · … · 38: **past simple (düzenli)** · 39: was/were

- 40 oturumda hiç odak olmayan konular: a/an, çoğul, there is/are, can, some/any, **düzensiz geçmiş zaman, going to, will, should/must**.

| | Ortalama ön koşul ihlali (20 tohum) | 40 oturumda hiç odak olmayan açık konu |
| --- | --- | --- |
| A1 | 3,4 (en az 2, en çok 4) | 5 / 20 |
| A2 | 5,6 (en az 4, en çok 8) | 9 / 30 |

### 1.3 Okul konusu

- Haftada bir ana sayfa kartıyla soruluyor ve atlanabiliyor (PRD F10). Öğrenci 32 konudan birini seçiyor ya da "hatırlamıyorum" diyor.
- Seçilen konu +0,20 öncelik alıyor. Odak ya da tekrar değilse ilk çapraz tekrar slotuna giriyor (PLAN karar 35).
- Eksikler:
  - Okula gitmeyen öğrenci için bir yol yok.
  - Okulun programı sistemde yok; öğrencinin her hafta hatırlaması gerekiyor.
  - Okul konusunun ön koşulu eksikse bunu tamamlayan bir köprü yok.
  - Konu zaten sağlamsa bile tekrar ediliyor.

### 1.4 Tempo ve oturum içeriği

- Yeni konuya geçiş için bir kural yok; sıra yalnızca önceliğe göre değişiyor.
- Tekrar aralıkları sabit (1/3/7/14 gün; SPEC 4.2).
- Karışık çalışma (interleaving) tasarlanmamış.
- Oturumdaki bütün etkinlikler tek bir konuyu test eden dil odaklı alıştırmalar. Anlam odaklı girdi (anlamak için okuma ya da dinleme) ve akıcılık çalışması yok.

---

## 2. Araştırma: müfredat tasarımı hakkında ne biliyoruz?

### 2.1 Kapsam: A1–A2'de ne öğretilir?

- **CEFR ve Tamamlayıcı Cilt (2020)** [1] seviyeleri "yapabilir" (can-do) tanımlarıyla verir. Yaklaşımı eylem odaklıdır: müfredat yalnızca dilbilgisi listesi değil, öğrencinin dille yapabileceği işlerdir.
- **British Council–EAQUALS Core Inventory for General English** [2]: kurumların her CEFR seviyesinde **fiilen ne öğrettiğini** gösteren envanter. Dilbilgisi, işlevler, söylem belirleyicileri, kelime alanları ve konuları kapsar. CEFR tanımlarından ve üye okulların izlencelerinden türetilmiş, seviye yerleşimi ayrıca doğrulanmıştır [3].
- **English Grammar Profile (EGP)** [4]: Cambridge Learner Corpus'tan (55 milyon kelimeden fazla) çıkarılan 1.200'den fazla dilbilgisi yeterlik ifadesi. Öğrencilerin bir yapıyı hangi seviyede **doğru kullanmaya başladığını** gösterir; kuralcı değildir. Açık erişimlidir (CC BY 4.0).
- **Kelime:** Kelime büyüklüğü CEFR seviyesiyle güçlü biçimde ilişkilidir. X_Lex ölçeğinde A1 1.500 kelimenin altında, A2 1.500–2.500 arasındadır [5]. NGSL (yaklaşık 2.800 kelime) genel metinlerin yaklaşık %92'sini kapsar; 1.01 sürümü CC BY-SA 4.0 lisanslıdır [6]. CEFR-J kelime listesi A1–B2 seviye etiketleri verir; lisansı ayrıca kontrol edilmeli [7].

**Sonuç:** Konu listemiz bu üç kaynakla karşılaştırılarak doğrulanmalı ve genişletilmeli. İşlev ("yapabilir") ve kelime katmanları eklenmeli.

### 2.2 Sıra: hangi sırayla?

- **Ön koşul grafiği ve "öğrenmeye hazır" sınırı.** Bilgi uzayı kuramında (KST) öğrencinin **dış sınırı** (outer fringe), ön koşulları tamamlanmış ama henüz öğrenilmemiş konulardır; yani "öğrenmeye hazır" olduğu yer [8]. ALEKS öğrenciye yalnızca bu sınırdaki konuları sunar ve aralarından seçim yaptırır [9].
- **Gelişim sıraları ve öğretilebilirlik.** İşlenebilirlik kuramına göre öğrenciler bazı yapıları sabit aşamalarla edinir. Soru oluşturma bunun tipik örneğidir: önce sıra değiştirmeden soru ("You like this?"), sonra *be* ile soru ("Where is the ball?"), sonra yardımcı fiille soru ("Where do you live?") [10, 11]. Öğretilebilirlik hipotezine göre öğretim, öğrencinin bir sonraki aşamasını hedeflediğinde en etkilidir [10]. Bulgular karışık: hazır olmayan öğrencilerin de yararlandığını gösteren çalışmalar var ve anadil bu süreci etkiliyor [12]. Bu yüzden ön koşulları **yumuşak kısıt** olarak kullanırız.
- **Biçimbirimlerin edinim sırası.** Edinim sırasını beş etken büyük ölçüde açıklıyor: algısal belirginlik, anlamsal karmaşıklık, biçim düzenliliği, sözdizimsel kategori ve sıklık [13]. Üçüncü tekil -s ve tanımlıklar (a/an/the) gibi belirginliği düşük yapılar, ne zaman öğretilirse öğretilsin geç oturur. Ders: bu konularda erken "ustalık" beklenmez ve ilerleme bu konulara takılmaz. Uzun süreli, aralıklı tekrarla taşınırlar.
- **Sıklık ve iletişimsel değer.** Konuşma dilinde geniş zaman ve geçmiş zaman çok baskındır; present perfect ve sürekli görünüş daha seyrektir [14]. Erken üniteler en çok işe yarayan yapılara ayrılmalı.
- **Ders kitabı uzlaşısı.** Core Inventory, kurumların izlencelerindeki ortak sıranın özetidir [2]. Okul modu ile kendi programı arasında tutarlılık bu sayede sağlanır.

### 2.3 Seçim: bu öğrenciye bugün ne?

- **Ustalık öğrenmesi.** 108 kontrollü değerlendirmenin meta-analizi sınav başarısında olumlu etki buluyor; etki zayıf öğrencilerde daha güçlü [15]. Ön koşul olmadan ilerlemek verimsizdir. Öte yandan sarmal müfredat (konuya giderek artan derinlikte geri dönmek) dil öğreniminde doğal yapıdır; bu yüzden katı bir kilit yerine "hazır olma eşiği" kullanırız.
- **Uygun zorluk.** İkili sınıflama türü öğrenmede en hızlı öğrenme, yaklaşık %85 doğrulukta gerçekleşiyor [16]. Bu bulgu karmaşık insan öğrenmesine doğrudan taşınamaz; yine de uygulama maddelerinde %70–85 başarı hedeflemek için bir dayanaktır.
- **Seçim hakkı.** Seçenek sunmak içsel motivasyonu, çabayı ve performansı artırıyor; etki 2–4 seçenekte en güçlü [17]. ALEKS'teki "hazır konulardan seç" tasarımı da aynı ilkeye dayanıyor [9].
- **İhtiyaç analizi.** Müfredat öğrencinin hedef görevlerinden türetilmeli [18]. Türkiye'deki hazırlık programları 2016 YÖK yönetmeliği çerçevesinde CEFR'e dayanıyor; zorunlu hazırlıkta yaygın hedef B1, bazı programlarda B1+ ya da B2 [19]. Yani A1–A2, öğrencinin ulaşması gereken hedefin temelidir. Okul modunda okulun programı, kendi programında öğrencinin hedefi belirleyicidir.

### 2.4 Tempo ve uygulama düzeni

- **Aralıklı tekrar.** L2 öğreniminde orta–büyük etki yaratıyor [20]. Kısa aralıklar anlık testte uzun aralıklarla aynı sonucu verirken gecikmeli testte geride kalıyor. Eşit ve genişleyen aralık planları istatistiksel olarak denk. Bizde tekrar zamanını modelin unutma tahmini belirleyecek.
- **Karışık çalışma (interleaving).** 115 Japon öğrenciyle yapılan dilbilgisi çalışmasında karışık uygulama, alıştırma sırasında daha çok hataya yol açtı; ancak **bir hafta sonraki testte bloklu uygulamadan daha iyi** sonuç verdi [21]. Etki, birbirine karışan yapılarda en anlamlı. Öneri, aynı çalışmadaki "artan" düzen: önce bloklu, sonra karışık.
- **Açık öğretim.** Odaklı ve açık öğretim büyük kazanımlar sağlıyor ve kalıcı [22]. Ölçüm yöntemiyle ilgili eleştiriler var [23]; yine de kısa açıklama ve ardından uygulama yaklaşımımızı destekliyor.
- **Dört alan dengesi.** Nation'a göre iyi bir dil kursu dört alana kabaca eşit zaman ayırır: anlam odaklı girdi, anlam odaklı çıktı, dil odaklı öğrenme ve akıcılık gelişimi [24]. Okula giden öğrencide uygulama okulun tamamlayıcısıdır ve dil odaklı ağırlık kabul edilebilir. **Okula gitmeyen öğrencide ise uygulama bütün kurstur; denge şarttır.**

### 2.5 Kelime ve metin düzeyi

- Bir metni anlamak için kelimelerinin en az %95'ini (asgari), tercihen %98'ini (iyi anlama) bilmek gerekiyor [25]. Bizde bu, üretilen her metnin bilinen kelime oranının ölçülüp denetlenmesi demek.
- Kelime büyüklüğü seviyenin en güçlü göstergelerinden biri [5]. Kelime öğrenimi şu an kapsam dışı (SCOPE v2 havuzu); aşağıda ayrı bir karar olarak öneriliyor.

### 2.6 Sesletim önceliği

- **İşlevsel yük.** İşlevsel yükü yüksek ses karşıtlıklarındaki hatalar anlaşılırlığı belirgin biçimde düşürüyor; düşük yüklü olanlar çok az etkiliyor. Tek bir yüksek yüklü hata, üç düşük yüklü hatadan daha kötü sonuç verdi. Düşük yüklü örnekler arasında /θ/–/f/ ve /ð/–/d/ var [26].
- **Ortak dil çekirdeği (Lingua Franca Core).** Bu çekirdek **th seslerini** uluslararası anlaşılırlık için gerekli saymıyor [27].
- Bu iki bulgu, mevcut iki sesletim konusundan `p.th`'nin düşük öncelikli olduğunu gösteriyor. Türk öğrenciler için yüksek yüklü ünlü karşıtlıkları (ör. /ɪ/–/iː/ ship–sheep, /æ/–/e/ bad–bed) aday olarak pedagoji sahibine sunuluyor.

### 2.7 Müfredatın kendisini ölçmek

- **Bilgi bileşeni modeli.** Konu tanımlarının (bilgi bileşenlerinin) doğruluğu öğrenme eğrileriyle sınanır [28]. Fırsat sayısı arttıkça hata oranı düzgünce düşüyorsa konu iyi tanımlanmıştır. Eğri düz ya da dalgalıysa konu ya iki ayrı beceriyi karıştırıyordur (bölünmeli) ya da gereksiz ayrıntıdır (birleştirilmeli).

---

## 3. Önerilen müfredat sistemi

```text
┌──────────────── KAPSAM ────────────────┐   ┌──────────── SIRA ────────────┐   ┌──────────── SEÇİM ────────────────┐
│ Kazanım haritası (pedagoji onaylı)     │   │ Ön koşul grafiği             │   │ Öğrenen modeli (P(ustalık))       │
│  · dilbilgisi konuları (EGP, Core Inv.)│ → │ Varsayılan yol = üniteler    │ → │  → hazır konular (dış sınır)      │
│  · yapabilirler (CEFR CV)              │   │ Karışabilir çiftler          │   │  → puan: değer, yol, okul, hedef  │
│  · kelime bantları (NGSL/CEFR-J)       │   │ Alt seviyeler A1.1…A2.2      │   │  → oturum bileşimi + tempo        │
│  · sesletim (işlevsel yük)             │   └──────────────────────────────┘   │  → 2–3 seçenek (öğrenci seçer)    │
└────────────────────────────────────────┘                                      └───────────────────────────────────┘
      Okul modu: okul programı haftalık konuyu getirir (köprüyle)  ·  Kendi programım: hedef + varsayılan yol
```

### 3.1 Kapsam: kazanım haritası

Her kazanım bir düğümdür. Bugünkü `topics` satırına şu alanlar eklenir (adlar öneri):

| Alan | Anlamı | Kaynak |
| --- | --- | --- |
| `sublevel` | A1.1, A1.2, A2.1, A2.2 (CEFR-J tarzı alt seviye) | Core Inventory, EGP, pedagoji |
| `irt_b` | Ortak ölçekte zorluk (yerleştirme belgesi 5.1) | Başlangıç: uzman tahmini; sonra veriden |
| `value` | İletişimsel değer, 1–3 | Puanlama ölçütü 3.2'de |
| `exam_weight` | Hazırlık sınavındaki ağırlık, 0–2 | Okul programı |
| `prereqs` | Sert ön koşullar (var) | Pedagoji; 4.2'deki düzeltmeler |
| `confusables` | Karışabilir konular (karışık çalışma için) | L1 hata kodları; 4.3 |
| `can_dos` | Hizmet ettiği "yapabilir" ifadeleri | CEFR CV |
| `unit` | Varsayılan yoldaki ünite | Bölüm 4 |

**Doğrulama süreci (pedagoji sahibi ve danışman öğretmen, tahmini 1–2 gün):**
1. Her konu Core Inventory ve EGP'deki karşılığıyla eşlenir; seviye kanıtı not edilir.
2. Eksik adaylar değerlendirilir (4.4).
3. Konu tanımları öğrenme eğrisi ölçütüne uygun olmalı (2.7). Bir konu tek bir kural öğretmeli: "wh- soruları" gibi iki aşamalı yapılar bölünür (4.2).

### 3.2 Sıra: varsayılan yol

- Varsayılan yol, ön koşul grafiğinin **öncelikli topolojik sırasıdır**. Her adımda ön koşulları tamamlanmış konular arasından değeri en yüksek ve en temel olan seçilir. Eşitlikte Core Inventory'deki ve ders kitaplarındaki ortak sıra belirler.
- Konular bir "yapabilir" etrafında 2–4 konuluk **ünitelere** gruplanır (Bölüm 4'te taslak). Öğrenci ve öğretmen ilerlemeyi bu birimlerle okur.
- **İletişimsel değer ölçütü (1–3):**
  1. Girdi sıklığı: konuşma ve yazıda ne kadar sık?
  2. A1–A2 "yapabilir"leri için zorunlu mu?
  3. Hata anlamı bozuyor mu?
  4. Hedef sınavda ağırlığı.

  Pedagoji sahibi her konuya bir puan verir. Puan **giriş sırasını** etkiler; L1 riskinin buna etkisi yoktur.
- **L1 riskinin yeni rolü:**
  - Konu açıldıktan sonra daha sık aralıklı tekrar (unutma eşiği daha sıkı).
  - Karşılaştırmalı Türkçe açıklama (mevcut özellik).
  - Teşhiste daha yüksek hata önseli.

  L1 riski konunun **ne zaman açılacağını** değil, **ne kadar uygulama alacağını** belirler.

### 3.3 Seçim: bugün ne çalışılacak?

Öğrenen modelinden (yerleştirme belgesi Bölüm 7) her konu için şunlar hesaplanır:

| Durum | Kural |
| --- | --- |
| **Sağlam** | En az iki becerinin birinde (biri üretim becerisi) P(ustalık) ≥ 0,8 |
| **Çalışılıyor** | Açılmış ve henüz sağlam değil |
| **Hazır** (dış sınır) | Ön koşulları P ≥ 0,7 ve henüz açılmamış |
| **Kilitli** | Ön koşul eksik |

**Yeni konu seçimi.** Hazır konular arasından şu puanla seçilir (ağırlıklar `app_settings`'te):

```text
puan = w_değer·value + w_yol·(yolda erken olma) + w_okul·[okul konusu ya da onun köprüsü]
     + w_hedef·[öğrencinin hedefiyle ilgisi] + w_sınav·exam_weight·[okul modu]
```

**Öğrenciye seçim hakkı.** Ana sayfada "Bugün ne çalışalım?" kartında hazır konulardan **2–3 seçenek** gösterilir; biri önerilen varsayılandır [9, 17]. Öğrenci seçmezse varsayılanla başlanır. Seçenekler hep hazır konulardan geldiği için ön koşul ihlali olmaz.

**Tempo kuralları:**
- Oturum başına en çok 1 yeni konu açılır.
- Odak konusu bir üretim becerisinde P ≥ 0,6'ya ulaşınca ya da 3 oturum geçince yeni konu açılabilir. Böylece belirginliği düşük yapılara takılıp kalınmaz [13]; bunlar tekrarla taşınır.
- "Çalışılıyor" durumundaki konu sayısı en çok 3 olur. Yığılma olursa yeni konu açılmaz.
- Uygulama maddelerinde hedef başarı %70–85; zorluk modelin tahminine göre ayarlanır [16]. Ölçme sondaları bu kuralın dışındadır.

### 3.4 Oturum bileşimi (9 etkinlik, 15–20 dakika)

| Slot | Amaç | Alan [24] | Dayanak |
| --- | --- | --- | --- |
| 1–3 | **Odak:** yeni ya da devam eden konu. İlk 1–2 oturum bloklu, sonra karışabilir konusuyla karışık | Dil odaklı | Açık öğretim [22]; ustalık [15]; artan düzen [21] |
| 4–5 | **Aralıklı tekrar:** vadesi gelen konular; karışabilir çiftler birlikte | Dil odaklı, geri getirme | [20, 21] |
| 6 | **Doğrulama sondası:** şüpheli boşluğu başka bir beceride sınamak ("konu mu beceri mi?") | Ölçme | Yerleştirme belgesi 7.5 |
| 7 | **Anlam odaklı girdi:** kısa metin ya da dinleme; bilinen kelime ≥ %95–98; konu tekrarı içinde | Anlam odaklı girdi | [24, 25] |
| 8 | **Anlam odaklı çıktı:** bir "yapabilir"e yönelik konuşma ya da yazma görevi | Anlam odaklı çıktı | [1, 24] |
| 9 | **Akıcılık turu** (sağlam konular, hızlı ve kolay) ya da **germe** | Akıcılık | [24] |

- **Okul modunda** 7 ve 9. slotlar daha seyrek kullanılabilir; okul anlam odaklı girdiyi sağlar.
- **Kendi programım modunda** dengeye yaklaşılır: 7–9. slotlar her oturumda bulunur.
- Bugünkü kurallar korunur: dört becerinin hepsi oturumda yer alır; seslendirme yoksa dinleme slotları metne düşer.

### 3.5 Okul modu

1. **Başlangıçta sorulur:** "Hazırlık programında mısın?"
   - Evet ise üniversite ve kur seçilir. Okul listede yoksa "okulum listede yok" seçeneği var.
2. **Program haritası:** Pedagoji sahibi pilot okulun haftalık programını bir kez konu kimliklerine eşler (`programs` ve `program_weeks`). Haftanın okul konusu kendiliğinden gelir; öğrenci tek dokunuşla doğrular: "Bu hafta okulda geçmiş zaman mı işlediniz?" Harita yoksa bugünkü haftalık soru kalır. Konu listesinin başına varsayılan yola göre en olası 3 konu konur.
3. **Okul konusunun durumuna göre:**

   | Konunun durumu | Plan |
   | --- | --- |
   | Hazır | O hafta odak olur (en az 2 oturum; PRD F10) |
   | Ön koşulu eksik | **Köprü:** önce eksik ön koşul kısa bir sonda ve öğretimle ele alınır, sonra okul konusu. Öğrenci derste konuyu takip edebilir |
   | Zaten sağlam | Yalnızca bir sonda ve tekrar; zaman boşa harcanmaz |

4. **(İsteğe bağlı) Sınav takvimi:** Kur sınavı tarihi girilirse son 1–2 haftada o kurun konularının aralıklı tekrarı artırılır [20].

### 3.6 Kendi programım (okula gitmeyen öğrenci)

1. **Başlangıçta hedef sorulur:**
   - Günlük iletişim: dinleme ve konuşmaya ağırlık; değeri yüksek zamanlar öne.
   - Okul/sınav: doğruluk ve okumaya ağırlık; `exam_weight` devrede.
   - İş/seyahat: işlevler ve kelime alanları.

   Hedef seçimi puan ağırlıklarını değiştirir.
2. **Yolculuk:** Öğrenci yerleştirmeden çıkan durumundan başlayarak varsayılan yolu uyarlamalı biçimde izler. Sağlam konular yalnızca bir sondayla geçilir. Boşluklar onarılır. Yeni konular dış sınırdan açılır.
3. **Haftalık hedef "yapabilir" diliyle sunulur:** "Bu hafta: geçmiş zamanla hafta sonunu anlatabilmek." Hedefe ulaşıldığında ilerleme ekranında görünür.
4. **Dört alan dengesi:** Uygulama bütün kurs olduğu için 3.4'teki 7–9. slotlar her oturumda bulunur.

### 3.7 İçerik kontrolü: kelime düzeyi

- Seviye listeleri: NGSL sıklık sıralaması [6] ile CEFR-J ya da EVP seviye etiketlerinden [7] **A1** ve **A2** listeleri. Kesin sınırları pedagoji sahibi belirler; başlangıç önerisi yaklaşık A1 ≈ ilk 1.000, A2 ≈ ilk 2.000 kelime [5].
- Üretim komutuna seviye listesi verilir. Kodda kapsama oranı hesaplanır: konu kelimeleri, özel adlar ve işlev kelimeleri dahil, bilinen kelime oranı **A2'de ≥ %95, A1'de ≥ %98** olmalı [25]. Altında kalırsa slot yeniden üretilir; `checks.ts`'e yeni bir kontrol eklenir.
- **Karar 2 (kelime öğrenimi alanı):** Hedef kelimelere maruz kalmanın izlenmesi, ara sıra kısa evet/hayır kelime kontrolleri ve kaçırılan kelimelerin aralıklı tekrarı. Bu bir kapsam genişlemesi; SCOPE'ta v2 havuzunda.

### 3.8 Sesletim

- `p.w_v` korunur: ortak dil çekirdeğinde yer alıyor [27].
- `p.th` düşük önceliğe alınır [26, 27]: daha seyrek sorulur ve öğrenciye "zayıf" olarak öne çıkarılmaz.
- Yüksek işlevsel yüklü ünlü karşıtlıkları (/ɪ/–/iː/, /æ/–/e/) Türk öğrenciler için aday olarak eklenir. Pedagoji sahibi doğrular. Türk öğrenciler için kesin liste, ölçülerek belirlenmeli (Bölüm 5).

---

## 4. Taslak: varsayılan yol, düzeltmeler ve karışabilir çiftler (pedagoji onayına)

### 4.1 Üniteler (mevcut 30 konu)

| Ünite | "Yapabilir" (CEFR CV dilinde, taslak) | Konular |
| --- | --- | --- |
| A1-1 Kendini tanıt | Kendini ve başkalarını basitçe tanıtabilir | am/is/are · özne zamirleri · cümle sırası · a/an |
| A1-2 Etrafındaki dünya | Çevresindeki nesneleri ve yerleri söyleyebilir | çoğul · there is/are · in/on/at (yer) · iyelik sıfatları · have/has |
| A1-3 Günlük hayat | Günlük rutinini anlatabilir, basit sorular sorabilir | present simple · 3. tekil -s · sıklık zarfları · in/on/at (zaman) · do/does ile soru ve olumsuz · wh- soruları |
| A1-4 Yapabildiklerin, istediklerin | Yeteneklerini söyleyebilir, basit alışveriş yapabilir | can · nesne zamirleri · some/any, much/many · the |
| A1-5 Şu an | Şu anda olanları anlatabilir | present continuous (present simple ile karışık) |
| A2-1 Geçmiş | Geçmişteki olayları anlatabilir | was/were · past simple (düzenli) · past simple (düzensiz) · did ile soru ve olumsuz |
| A2-2 Planlar | Planlarını ve tahminlerini söyleyebilir | going to · will (karışık) |
| A2-3 Karşılaştırma | İnsanları, yerleri, şeyleri karşılaştırabilir | karşılaştırma ve üstünlük |
| A2-4 Kurallar ve tavsiye | Tavsiye verebilir, kuralları anlatabilir | should / must / have to |
| A2-5 İstekler | İsteklerini ve sevdiklerini anlatabilir | want to / like -ing |
| A2-6 Deneyimler | Deneyimlerini anlatabilir | present perfect (past simple ile karışık) |

### 4.2 `topics.csv` için önerilen düzeltmeler (pedagoji sahibi karar verir)

| Konu | Öneri | Gerekçe |
| --- | --- | --- |
| `g.wh_questions` | İkiye bölünür: **be ile soru** (A1-1/2: "Where is…?") ve **do ile soru** (A1-3: "Where do you live?") | Soru gelişim aşamaları: *be* ile soru, yardımcı fiilli sorudan önce gelir [10, 11]; öğrenme eğrisi ölçütü [28] |
| `g.possessives` | Ön koşul olarak özne zamirleri (var); ünite A1-2 | Ölçümde ihlal edildi (1.2) |
| `g.present_simple_3sg` | Uzun süreli tekrarla taşınır; ilerlemeyi kilitlemez | Belirginliği düşük biçimbirim [13] |
| `g.articles_a_an`, `g.articles_the` | Erken açılır; ustalık beklentisi düşük, tekrarı yüksek | Aynı neden [13]; Türkçede tanımlık yok |
| `g.present_perfect` | A2'nin sonunda; past simple'dan sonra ve onunla karışık | Sıklık [14]; L1.PERFECT_PAST |
| `p.th` | Düşük öncelik | [26, 27] |

### 4.3 Karışabilir çiftler (karışık çalışma için)

Mevcut L1 hata kodlarından türetildi:

| Çift | L1 kodu |
| --- | --- |
| present simple ↔ present continuous | L1.SIMPLE_CONT |
| past simple ↔ present perfect | L1.PERFECT_PAST |
| a/an ↔ the | L1.ART_OMIT, L1.ART_THE |
| özne zamirleri ↔ iyelik sıfatları ↔ nesne zamirleri | L1.HE_SHE, L1.HIS_HER |
| there is/are ↔ have/has | L1.THERE_HAVE |
| in/on/at (zaman) ↔ in/on/at (yer) | L1.PREP_IN_ON_AT |
| going to ↔ will | — |
| can ↔ should/must/have to | — |
| past simple düzenli ↔ düzensiz | GEN.VERB_FORM |
| am/is/are ↔ present simple ("I am agree" türü) | L1.LITERAL, L1.BE_OMIT |

### 4.4 Eksik olabilecek A1–A2 konuları (Core Inventory ve EGP ile doğrulanacak adaylar)

- Emir kipi.
- this/that/these/those.
- İyelik 's.
- there was/were.
- Past continuous.
- would like.
- Sayılabilir/sayılamaz isimler (some/any konusundan ayrılabilir).
- Durum zarfları (-ly).
- Gelecek için present continuous.
- could/couldn't.
- how often / how much / how many soruları.

Bu listedeki seviye yerleşimleri **doğrulanmadı**. Pedagoji sahibi ve danışman öğretmen Core Inventory [2] ve EGP [4] ile karşılaştırarak seçer. Her yeni konu L1 kodu, yerleştirme maddesi ve üretim kurallarına da etki eder.

---

## 5. Müfredatı ölçmek ve iyileştirmek

- **Öğrenme eğrileri:** Her konu için hata oranı ile fırsat sayısı arasındaki ilişki haftalık izlenir [28]. Düz ya da dalgalı eğri, konunun bölünmesi ya da birleştirilmesi gerektiğine işaret eder.
- **Kalıcılık:** En az 48 saat sonraki tekrar başarısı. `activity_stats` mekanizması bu veriyi zaten topluyor.
- **Aktarım:** Konunun serbest üretimde (yazma, konuşma) doğru kullanımı. Değerlendirmedeki `evidence` ve önerilen `advanced_evidence` alanlarından ölçülür.
- **Tempo:** Haftada sağlamlaşan konu sayısı, konu başına sağlamlaşma süresi, "çalışılıyor" yığılması.
- **Mikro deneyler** (pilot sonrası, n büyüdükçe): Karışabilir çiftlerde karışık ve bloklu düzen öğrenci içinde rastgele atanır. Seçenek sunma ile otomatik seçimin tamamlama oranları karşılaştırılır.
- **Simülasyonla kabul testi** (M13 Bitti testine eklenir):
  - Yeni seçim politikasında ön koşul ihlali 0.
  - Pratikle öğrenen sanal öğrencide A1 ya da A2'nin bütün konuları 40 oturum içinde en az bir kez odak oluyor.
  - Okul konusunun ön koşulu eksikse köprü çalışıyor.
  - Bugünkü planlayıcının ölçümü (1.2) karşılaştırma tabanı olarak kullanılır.
- **Sesletim önceliği:** Pilotta dinle-seç maddelerinden Türk öğrencilerin hangi karşıtlıklarda gerçekten hata yaptığı ölçülür ve liste buna göre güncellenir.

---

## 6. Önceki öneriyle birleşme ve uygulama etkisi

| Taş (önceki belge, Bölüm 10) | Müfredat eklemesi |
| --- | --- |
| M11 Ölçek ve madde bankası | Kazanım haritası: `topics` yeni alanları, üniteler, karışabilir çiftler, "yapabilir"ler; konu doğrulaması (pedagoji); A1/A2 kelime listeleri (lisans kontrolü) |
| M12 Uyarlamalı yerleştirme ve kapı | Başlangıç akışında **çalışma modu** (okul ya da kendi programım), okul/kur seçimi ve hedef |
| M13 Öğrenen modeli v2 | **Müfredat motoru** `lib/engine/curriculum.ts` (saf): hazır konular, varsayılan yol, puanlama, tempo, oturum bileşimi, köprü. Planlayıcının odak ve germe adımlarının yerini alır. Ana sayfada "Bugün ne çalışalım?" seçenekleri |
| M14 Değerlendirme hassasiyeti | Üretimde **kelime kapsama denetimi** (`checks.ts`); anlam odaklı girdi ve akıcılık etkinliği için üretim kuralları |
| M15 Kalibrasyon ve izleme | Konu öğrenme eğrileri, kalıcılık ve tempo raporları (yönetim paneli) |

**Önerilen veri modeli değişiklikleri:**
- `topics` tablosuna yeni alanlar: `sublevel`, `irt_b`, `value`, `exam_weight`, `confusables`, `can_dos`, `unit`.
- Yeni tablolar: `can_dos` (seed); `programs` ve `program_weeks` (admin ya da seed).
- `profiles` tablosuna: `study_mode` (`school | self`), `program_id`, `goal`.
- `school_topics` tablosuna `source` (`program | student`).
- `app_settings`'e: `curriculum` (ağırlıklar, tempo, kapsama eşikleri).
- Her yeni tabloda RLS açık.

---

## 7. Belgelere önerilen değişiklikler (uygulanmadı)

| Belge | Öneri |
| --- | --- |
| SPEC §3 | Yukarıdaki tablo ve alanlar |
| SPEC §4.4 | Planlayıcı: açık konular ve odak seçimi müfredat motoruna geçer (hazır konular + puan + tempo); oturum bileşimi 3.4 |
| SPEC §5.1 ve §5.3 | Üretim komutu: seviye kelime listesi, anlam odaklı girdi ve akıcılık etkinlikleri; kapsama denetimi |
| SPEC Ek A | Konu listesi pedagoji doğrulamasından sonra güncellenir (4.2, 4.4); sesletim önceliği |
| PRD F2 | Çalışma modu ve hedef soruları |
| PRD F3 | Oturum bileşimi; "Bugün ne çalışalım?" seçenekleri |
| PRD F10 | Okul programı haritası, tek dokunuşla doğrulama, köprü; "en az 2 oturum" kuralı korunur |
| PRD yeni madde | "Kendi programım" modu |
| SCOPE | Kelime öğrenimi alanı (karar 2), program haritası, sesletim listesi |
| ROADMAP | M11–M15'e yukarıdaki eklemeler |

---

## 8. Karar bekleyen sorular

Önerilen varsayılan her sorunun sonunda. "Varsayılanlarla onay" demen yeterli.

**Müfredat:**

1. **Konu listesinin doğrulanması:** Pedagoji sahibi ve danışman öğretmen, 30 konuyu Core Inventory ve EGP ile karşılaştırıp düzeltmeler (4.2) ve eksik adaylar (4.4) hakkında karar versin mi? Tahmini emek 1–2 gün. *Varsayılan: evet.*
2. **Kelime:**
   - (a) Yalnızca içerik kontrolü (kapsama denetimi).
   - (b) Ek olarak kelime öğrenimi alanı: maruz kalma takibi, kısa kontroller, aralıklı tekrar.

   *Varsayılan: (a) şimdi; (b) pilot sonrası.*
3. **Okul modu:** Pilot öğrencileri tek bir üniversiteden mi? Öyleyse o okulun haftalık programını (kur planı ve ders kitabı) pedagoji sahibi konu kimliklerine eşleyebilir mi? *Varsayılan: evet; yoksa haftalık soru, önerilen 3 konuyla.*
4. **Kendi programım:** Okula gitmeyen öğrenciler pilot kitlesine dahil mi? Hedef sorusu başlangıç akışına eklensin mi? *Varsayılan: mod ve hedef sorusu eklensin; pilot kitlesi değişmesin.*
5. **Seçim hakkı:** Ana sayfada hazır konulardan 2–3 seçenek mi, yoksa tamamen otomatik mi? *Varsayılan: önerilen varsayılanla birlikte 2–3 seçenek.*
6. **Sesletim:** th sesi düşük önceliğe alınsın, ünlü karşıtlıkları aday olarak eklensin mi? *Varsayılan: evet; liste pedagoji onayıyla.*
7. **Oturum bileşimi:** Anlam odaklı girdi, çıktı ve akıcılık slotları eklensin mi? Oturum yine 15–20 dakika. *Varsayılan: evet; okul modunda daha seyrek.*

**Önceki belgeden açık kalanlar** (`olcme-ve-ogrenen-modeli.md` Bölüm 12):

8. **Yerleştirme süresi:** ortalama 14–19 madde (yaklaşık 8–10 dakika, en çok 25). *Varsayılan: kabul.*
9. **Kapı:** P ≥ 0,9, yanlış dışlama hedefi ≤ %2, 7 gün sonra tek yeniden test. *Varsayılan: kabul.*
10. **B1/B2 ölçme maddeleri:** Dil modeli taslak hazırlar, pedagoji sahibi onaylar ve sıralar. *Varsayılan: kabul.*
11. **Değerlendirmede 3 örnekli çoğunluk oyu:** Oturum başına yaklaşık +0,003–0,004 $. *Varsayılan: kabul, `grade_samples` ile kapatılabilir.*
12. **Konuşma maddesi:** Kapıda yalnızca destekleyici kanıt; tek başına karar vermez. *Varsayılan: kabul.*
13. **Bekleme listesi:** Bildirim izni için KVKK metnine bir cümle eklenir. *Varsayılan: kabul.*

---

## Kaynakça

1. Council of Europe (2020). *Common European Framework of Reference for Languages: Companion Volume.*
2. North, B., Ortega, A., & Sheehan, S. (2010). *British Council–EAQUALS Core Inventory for General English.* [Eaquals](https://www.eaquals.org/resources/the-core-inventory-for-general-english/)
3. Jones, G. (2015). *Validating the Core Inventory for General English.* British Council. [Bağlantı](https://www.britishcouncil.org/research-insight/validating-core-inventory-general-english)
4. O'Keeffe, A., & Mark, G. (2017). The English Grammar Profile of learner competence: Methodology and key findings. *International Journal of Corpus Linguistics*, 22(4), 457–489. [Açık erişim](https://dspace.mic.ul.ie/handle/10395/2151)
5. Milton, J., & Alexiou, T. (2009). Vocabulary size and the CEFR (GALA 14). [PDF](https://www.enl.auth.gr/gala/14th/Papers/English%20papers/Milton&Alexiou.pdf)
6. Browne, C., Culligan, B., & Phillips, J. (2013). *New General Service List.* [newgeneralservicelist.com](https://www.newgeneralservicelist.com/new-general-service-list)
7. Tono, Y. (2012 ve sonrası). *CEFR-J Wordlist.* cefr-j.org (lisans koşulları kontrol edilecek). Açık kaynak türev: [openlanguageprofiles/olp-en-cefrj](https://github.com/openlanguageprofiles/olp-en-cefrj)
8. Falmagne, J.-C., & Doignon, J.-P. (2011). *Learning Spaces.* Springer. Ayrıca: [Knowledge Spaces and Learning Spaces](https://arxiv.org/abs/1511.06757)
9. McGraw Hill, *ALEKS: Assessing the learning space.* [PDF](https://www.mheducation.com/content/dam/mhe/research/prek-12/essa-tier-4/aleks-assessing-learning-space.pdf)
10. Pienemann, M. (1984). Psychological constraints on the teachability of languages. *SSLA*, 6, 186–214; Pienemann, M. (1998). *Language Processing and Second Language Development: Processability Theory.* Benjamins.
11. Pienemann, M., Johnston, M., & Brindley, G. (1988). Constructing an acquisition-based procedure for second language assessment. *SSLA*, 10, 217–243.
12. Spada, N., & Lightbown, P. M. (1999). Instruction, first language influence, and developmental readiness in second language acquisition. *The Modern Language Journal*, 83(1), 1–21.
13. Goldschneider, J. M., & DeKeyser, R. M. (2001). Explaining the "natural order of L2 morpheme acquisition" in English: A meta-analysis of multiple determinants. *Language Learning*, 51(1), 1–50. [ERIC](https://eric.ed.gov/?id=EJ718472)
14. Biber, D., Johansson, S., Leech, G., Conrad, S., & Finegan, E. (1999). *Longman Grammar of Spoken and Written English.* Longman (Bölüm 6: zaman ve görünüş).
15. Kulik, C.-L. C., Kulik, J. A., & Bangert-Drowns, R. L. (1990). Effectiveness of mastery learning programs: A meta-analysis. *Review of Educational Research*, 60(2), 265–299.
16. Wilson, R. C., Shenhav, A., Straccia, M., & Cohen, J. D. (2019). The Eighty Five Percent Rule for optimal learning. *Nature Communications*, 10, 4646. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC6831579)
17. Patall, E. A., Cooper, H., & Robinson, J. C. (2008). The effects of choice on intrinsic motivation and related outcomes: A meta-analysis. *Psychological Bulletin*, 134(2), 270–300. [PubMed](https://pubmed.ncbi.nlm.nih.gov/18298272/)
18. Long, M. H. (2005). *Second Language Needs Analysis.* Cambridge University Press.
19. Yükseköğretim Kurumlarında Yabancı Dil Eğitim-Öğretimi ve Yabancı Dille Eğitim-Öğretim Yapılmasında Uyulacak Esaslara İlişkin Yönetmelik (Resmî Gazete, 23.03.2016, 29662) ve buna dayanan üniversite yönetmelikleri (ör. [NKÜ](https://esas.nku.edu.tr/dosyalar/dokuman/D84D3D5B-710B-FC73-3585-5ED7DA2EF4D4.pdf)).
20. Kim, S. K., & Webb, S. (2022). The effects of spaced practice on second language learning: A meta-analysis. *Language Learning*, 72(1), 269–319.
21. Nakata, T., & Suzuki, Y. (2019). Mixing grammar exercises facilitates long-term retention: Effects of blocking, interleaving, and increasing practice. *The Modern Language Journal*, 103(3), 629–647.
22. Norris, J. M., & Ortega, L. (2000). Effectiveness of L2 instruction: A research synthesis and quantitative meta-analysis. *Language Learning*, 50(3), 417–528.
23. Shin, H. W. (2010). Another look at Norris and Ortega (2000). *Studies in Applied Linguistics & TESOL*. [Bağlantı](https://journals.library.columbia.edu/index.php/SALT/article/view/1434)
24. Nation, P. (2007). The four strands. *Innovation in Language Learning and Teaching*, 1(1), 2–13.
25. Laufer, B., & Ravenhorst-Kalovski, G. C. (2010). Lexical threshold revisited. *Reading in a Foreign Language*, 22(1), 15–30. [Bağlantı](https://scholarspace.manoa.hawaii.edu/items/eaead47e-853e-4797-ba6f-596df150c1d7); Hu, M., & Nation, P. (2000). Unknown vocabulary density and reading comprehension. *Reading in a Foreign Language*, 13(1), 403–430.
26. Munro, M. J., & Derwing, T. M. (2006). The functional load principle in ESL pronunciation instruction: An exploratory study. *System*, 34(4), 520–531.
27. Jenkins, J. (2000). *The Phonology of English as an International Language.* Oxford University Press.
28. Koedinger, K. R., Corbett, A. T., & Perfetti, C. (2012). The Knowledge-Learning-Instruction framework. *Cognitive Science*, 36(5), 757–798.

> Kaynakların bir kısmı tam metinden değil, özet ve dizin kayıtlarından doğrulandı. Sayısal iddialar yalnızca doğrulanabilen özetlerden alındı.

## Ek: Ölçümü yeniden çalıştırma

Depo kökünden çalıştırılır; ağ ve API çağrısı yok:

```bash
npx tsx docs/arastirma/sim/mufredat_mevcut.ts 40 20
```

Çıktı: `docs/arastirma/sim/sonuclar/mufredat_mevcut.txt`
