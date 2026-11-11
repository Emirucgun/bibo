# PLAN — M4 (Teşhis motoru, saf TypeScript)

| | |
| --- | --- |
| Tarih | 11 Kasım 2026 |
| Kapsam | `ROADMAP.md` M4 · `SPEC.md` Bölüm 4 (4.1–4.6), Bölüm 12 · `PRD.md` F3, F7 |
| Durum | Uygulandı; Bitti testinin 7 maddesi yerelde yeşil (11.11.2026). Veritabanı, ağ ya da yapay zekâ çağrısı yok; göç yok. |
| Bağımlılık | M3'ten yalnızca kimlikler (`topics.csv`, `l1_codes.csv`, sabit kümeler) |

M1 ve M3 planları bu dosyanın git geçmişinde (`80efea6`, `b4d6af6`).

---

## 1. Yaklaşım

- `lib/engine/*` saf fonksiyonlar: girdi alır, çıktı döner. Zaman (`now: Date`) ve rastgelelik (`rng: () => number`) parametre olarak gelir; aynı girdi aynı planı üretir.
- Veritabanı satırlarına benzeyen ama ondan bağımsız türler (`lib/engine/types.ts`); M6 Route Handler'ları satırları bu türlere çevirip motoru çağırır.
- Testler fikstür tabanlı (`tests/engine/fixtures.ts`): küçük el yapımı konu listesi + gerçek seed ile bir duman testi.
- `scripts/simulate.ts` motorun çekirdeğini (`scripts/lib/simulate.ts`) çalıştırır; aynı çekirdek bir Vitest testinde de koşar, böylece Bitti testinin son maddesi CI'da da kanıtlanır.

## 2. Dosyalar

| Dosya | Ne |
| --- | --- |
| `lib/engine/types.ts` | `EngineTopic`, `MasteryState`, `MasteryRow`, `Evidence`, `PlanSlot`, `Plan`, `DiagnosisCandidate`, `LocalGradeResult` … |
| `lib/engine/normalize.ts` | `normalizeAnswer`, `tokenizeWords` (4.6 normalizasyon, kısaltma eşdeğerleri) |
| `lib/engine/grade-local.ts` | `gradeLocal` — `mcq_read`, `listen_choose`, `gap_fill`, `word_order`, `dictation` (kelime düzeyi Levenshtein) |
| `lib/engine/mastery.ts` | `prior`, `applyEvidence` (4.1), `reviewIntervalDays` / `nextReviewAt` (4.2), `masteryBand`, `evidenceFromAttempt` |
| `lib/engine/diagnosis.ts` | `diagnoseTopic` (4.3 kuralları), `reconcileDiagnoses` (aktif / superseded / resolved), `diagnosisMessage` (şablonlar) |
| `lib/engine/planner.ts` | `planSession` (4.4 adım 1–8) |
| `lib/engine/effectiveness.ts` | `creditRetest`, `applyCredit` (4.5) |
| `lib/content/activity-types.ts` | + `SKILL_LABELS_TR`, `ACTIVITY_TYPE_LABELS_TR` (teşhis mesajları için) |
| `scripts/lib/simulate.ts`, `scripts/simulate.ts` | Sentetik öğrenci, sahte değerlendirme, 6 oturum |
| `tests/engine/*.test.ts` | normalize, grade-local, mastery, diagnosis, planner, effectiveness, simulate |
| `.gitattributes` | Windows'ta `core.autocrlf=true` iken `seed.sql` CRLF'e dönüyor ve M3 eşitlik testi kırmızı oluyordu; metin dosyaları LF |

## 3. Verilen kararlar (SPEC'te açık bırakılan noktalar)

| # | Konu | Karar |
| --- | --- | --- |
| 1 | PLAN #20 — `topic_gap` dalı | SPEC'teki sözde kodda `topic_gap` iç içe `if` yüzünden erişilemez. Kurallar **sırayla** uygulanır: önce `skill_gap`, olmazsa `topic_gap`, olmazsa `activity_mismatch`. Eşikler `≤ 0,45` (PRD F7'deki "< 0,45" yerine SPEC/ROADMAP). Testler SPEC'teki cevap sırasını kullanır (1,1,1,1,0,1 / 0,0,1,0). |
| 2 | PLAN #19 — sesletim konuları (`p.*`) | Yalnızca dinleme becerisinde ölçülür. Odak, çapraz tekrar ve germe olmaz; yalnızca tekrar (1. adım) ve dinleme kapsaması. `tts_enabled = false` iken tamamen atlanır. |
| 3 | PLAN #13 — çift konulu kodlar | Motor kodu değil, etkinliğin `topic_id`'sini kullanır; ek alan gerekmedi. Göç yok. |
| 4 | Dört beceri kapsaması | 4.4 adım 4 yalnızca dinleme/konuşma diyor; amaç "dört beceri en az birer kez" olduğu için eksik **her** beceri (TTS kapalıyken dinleme hariç) kapsama ile eklenir. |
| 5 | Slot sayısı ve süre | Sıra: 1–7 adımlarıyla taslak → 10'u aşarsa kaldırma sırası germe, tekrar, çapraz tekrar (kapsamayı bozmadan) → süre > 1200 ise germe, tekrar çıkarılır, sonra aynı beceride daha kısa türe geçilir → süre < 900 ise çapraz tekrar eklenir (≤ 10), yetmezse aynı beceride daha uzun türe geçilir. |
| 6 | "Belirsiz konular" (çapraz tekrar) | Kanıtı olan (bir becerisinde `n > 0`), aktif teşhisi olmayan ve en az bir becerisinde `n < 3` olan konular; sıra: önce son 3 günde hata yapılanlar (en yeni önce), sonra belirsizler **toplam kanıtı en çok olandan** (kanıt dağılmasın, karara yaklaşsın), sonra öncelik sırası. Yeni öğrencide öncelik sırası. PRD F7 "güveni < 0,6 olan teşhis yerine eksik ölçülen beceride çapraz tekrar" bununla karşılanır. |
| 7 | Odak becerileri (teşhis yokken) | Konunun becerileri kanıt sayısı artan, ustalık artan, eşitlikte **yazma, konuşma, okuma, dinleme** sırasıyla dizilir; ilk iki farklı beceri + birinciye ikinci etkinlik. Üretim becerileri önde: tanıma becerileri (α = 0,15) yavaş ilerler ve ürünün ana ayrımı yazma/konuşma. `activity_mismatch` aktifse o beceride zayıf tür seçilmez. |
| 8 | `purpose` eşlemesi | Tekrar `review`, odak `focus`, çapraz tekrar `retest`, kapsama konusunun amacı (`focus` / `review`), germe `stretch`. |
| 9 | Germe konusu | Açık, sesletim olmayan, hiçbir becerisinde kanıtı olmayan, önkoşullarının her birinin ölçülmüş beceri ortalaması `≥ 0,6` olan ilk konu (`sort`). Önkoşulsuz konular uygundur. |
| 10 | İlgi alanı | `round(n × general_content_rate)` slot `null` (rastgele konum), diğerleri ilgi alanlarına sırayla. 8 slotta %75, 10 slotta %80 temalı (PRD F3 ≥ %70). |
| 11 | `l1_target` | Konuda son 3 günde yapılan en son hatanın kodu; yoksa konunun ilk `L1.*` kodu; yoksa `null`. |
| 12 | Teşhis yaşam döngüsü | Güven ≥ 0,6 → `active`; aynı konudaki farklı aktif teşhis `superseded`. Aynı tür ve aynı zayıf beceri/etkinlikle zaten aktif teşhis varsa yeni satır yazılmaz. `resolved`: `skill_gap` zayıf beceri `≥ 0,65`; `topic_gap` ölçülen becerilerin ortalaması `≥ 0,65`; `activity_mismatch` zayıf türün başarısı `≥ 0,70`. |
| 13 | Mesaj şablonu | "{konu}'yu" ekini her başlığa doğru uydurmak mümkün değil ("-s'yu"); "{konu} konusunu" kullanıldı. Diğer metin SPEC'teki gibi. |
| 14 | Dikte hata etiketleri | Hizalamadaki her değiştirme/eksik kelime bir hata; kelime `target_words` içindeyse `item.l1_target`, değilse `GEN.OTHER`; fazladan kelime `GEN.OTHER`; en çok 5. |
| 15 | `correct` sayacı | `is_correct` doğruysa artar (mesaj şablonlarındaki d/n buradan). |

## 4. Bitti testi eşlemesi

| ROADMAP maddesi | Test |
| --- | --- |
| Yazma 5/6 + konuşma 1/4 → `skill_gap(speaking)`, güven ≥ 0,6 | `tests/engine/diagnosis.test.ts` |
| Tüm beceriler ≤ 0,45, kanıt ≥ 6 → `topic_gap` | `tests/engine/diagnosis.test.ts` |
| Tür ≤ %35 / ≥ %70 → `activity_mismatch` | `tests/engine/diagnosis.test.ts` |
| Tek cevap ≤ 0,25; ipuçlu ≤ 0,5 | `tests/engine/mastery.test.ts` |
| 8–10 slot, 900–1200 sn, dört beceri, ≥ 1 çapraz tekrar; TTS kapalıyken dinleme yok | `tests/engine/planner.test.ts` (çok sayıda rastgele tohum + gerçek seed) |
| Dikte 0,80 → yanlış | `tests/engine/grade-local.test.ts` |
| `simulate.ts`: en geç 5. oturumda `skill_gap(speaking)` ≥ 0,6 | `tests/engine/simulate.test.ts` + `npx tsx scripts/simulate.ts` |

## 5. Açık sorular

1. **Karar 1 ve 13** SPEC metninden küçük sapmalar; onaylanırsa SPEC 4.3'e işlenmeli (öneri, `docs/SPEC.md` değiştirilmedi).
2. **Karar 12**: `topic_gap` ve `activity_mismatch` için "çözüldü" koşulu SPEC'te yok; burada önerildi.
3. Pedagoji sahibine: sesletim konuları için yalnızca tekrar/kapsama yeterli mi (karar 2)?
4. **Simülasyon sağlamlığı:** `simulate.ts` varsayılan tohumla (42) 5. oturumda güven 1,0 ile `skill_gap(speaking)` buluyor. 100 tohumda ≈ %76'sı 5. oturuma kadar, kalanı 6. oturumda ya da sonra. Sebep SPEC 4.4'ün odak önceliği: `1 − min ustalık` olduğu için konu biraz ilerleyince odak, hiç dokunulmamış riskli konuya geçiyor ve kanıt dağılıyor. Denenen iki odak becerisi alternatifi daha kötüydü. Daha sağlam sonuç için öneri (SPEC değişikliği): aday teşhisi (güven < 0,6) olan konuya öncelikte `+0,10` ya da odağın en az 2 oturum aynı konuda kalması.

## 9. Sonraki taşlar için açık kararlar

Bunlar M1'i etkilemez. Önerilen varsayılanlar **onaylanmadı**; her biri ilgili taşın planında yeniden sorulur. Çoğu SPEC değişikliği gerektirir.

| # | Taş | Sorun | Önerilen varsayılan |
| --- | --- | --- | --- |
| 13 | M3 | `l1_codes.topic_id` tek değer, ama sekiz kod iki konuya bağlı; `topics`'te "ilgili kodlar" alanı yok | **Karar verildi (M4 #3):** ek alan gerekmedi |
| 14 | M5/M7 | Dinlemede seslendirilen metin (`payload.text_en`) öğrenciye açık; cevap sızar | Dinleme türlerinde metin `item_keys`'te |
| 15 | M5/M6 | Günlük sınır üretimde denetlenince ön üretim engelleniyor; saat dilimi tanımsız | Sınır `start`'ta denetlenir; Europe/Istanbul |
| 16 | M5/M6 | Üretim zaman aşımı 120 sn + yeniden deneme, `maxDuration = 120`'ye sığmıyor | `finish` için `maxDuration = 300` |
| 17 | M6/M10 | `generating` durumu yok (çift üretim); cron'daki "yeniden planla" için durum yok | `generating` eklenir; bayat `ready` → `abandoned` |
| 18 | M8 | PRD önce transkripti gösteriyor, API transkript + değerlendirmeyi tek çağrıda dönüyor | İki deneme de değerlendirilir, ustalığa sonuncusu işlenir |
| 19 | M4 | Sesletim konuları yalnızca dinle-seç ile ölçülüyor; odak ve teşhis kuralları uygulanamıyor | **Karar verildi (M4 #2)** |
| 20 | M4 | `topic_gap` dalı yazıldığı hâliyle erişilemez; eşik `<` / `≤` farkı; "5/6" sıraya bağlı | **Karar verildi (M4 #1)** |
| 21 | M6/M7 | Profil güncelleme ve olay yazma uç noktaları yok | `PATCH /api/profile`, `POST /api/events` |
| 22 | M9 | Yerleştirme tohumlaması ve "3 zayıf konu" seçimi tanımsız | Normal kanıt gibi işlenir; en düşük ustalıklı üç konu |
| 23 | M6 | Açıklama modu "kısa"ya geri dönmüyor | Aynı kural tersine de işler |
