# PLAN — M3 (Tam şema ve içerik omurgası)

| | |
| --- | --- |
| Tarih | 11 Kasım 2026 |
| Kapsam | `ROADMAP.md` M3. M2 (giriş, davet, onam) bu planda yok. |
| Durum | Uygulandı; `dev` ve `prod`'a `db push` ve pedagoji onayı bekliyor. |
| Kaynak belgeler | `SPEC.md` Bölüm 2 (dizin), 3 (veri modeli, RLS), 5.2 (şemalar), Ek A–C · `ROADMAP.md` M3 · `.claude/rules/veritabani.md` |

M1'in planı bu dosyanın git geçmişinde (`80efea6`).

---

## 1. Neden M2 değil de M3

- M3 kritik yolda: M3 → M4 → M5 → M6. M2'ye ancak M9'da ihtiyaç var (`ROADMAP` akış şeması); ikisi bağımsız.
- M3 tamamen yerelde doğrulanabilir (SQL + Vitest). M2'nin bitti testi Google OAuth ekranı, iki gerçek Google hesabı ve telefonda elle deneme ister.
- M3 rol yardımcısını (`private.user_role()`) getirir; M2'nin `profiles` / `cohorts` politikaları bunu yeniden kullanır.

## 2. Verilen kararlar

| # | Konu | Karar |
| --- | --- | --- |
| 1 | Tek göç | `20261111150000_m3_full_schema.sql`: 14 yeni tablo, indeksler, `check` kısıtları, RLS politikaları ve `app_settings` admin politikaları. `cohorts` ve `profiles` politikaları M2'de. |
| 2 | Rol yardımcısı | `private.user_role()` (security definer, `search_path = ''`). `private` şeması API'ye açık değil; politikalar `(select private.user_role()) = 'admin'` biçiminde. |
| 3 | Admin "tümü" | Öğrenci tablolarında, `topics`, `l1_codes`, `teacher_reviews`'da admin için `for all`; `llm_usage`, `tts_cache` yalnızca `select`; `app_settings` `select` + `update`; `item_keys`'te admin dahil **hiçbir** politika yok. |
| 4 | Öğretmen kapsamı | Öğrenci tablolarında öğretmen tüm satırları okur (SPEC: "`select` (inceleme için)"; kohort sınırı yalnızca `profiles` için yazılı). Tek kohortlu pilotta fark yok. |
| 5 | Silme zinciri | Öğrenci tabloları `auth.users` → `on delete cascade`. `llm_usage.user_id` / `session_id` → `on delete set null` (maliyet geçmişi kalır, kişiyle bağ kopar). `teacher_reviews.reviewer_id` → `set null` (altın veri kalır). |
| 6 | Sabit olmayan küme | `llm_usage.provider` ve `events.name` için `check` yok: M1'de sağlayıcı OpenRouter oldu (SPEC'teki `anthropic` / `azure` listesi tutmuyor), olay adları PLAN #21 ile genişleyebilir. |
| 7 | Ek kısıtlar | `items (session_id, position)` benzersiz; `school_topics.week_start` pazartesi; `teacher_reviews` `verdict = 'fix'` ise `corrected_l1_code` zorunlu; `attempts.try_no` 1–2; skor ve sayaçlar aralıkta. |
| 8 | Seed akışı | Kaynak `supabase/seed/*.csv`. `npx tsx scripts/build-seed.ts` → `supabase/seed.sql` (upsert, tekrar çalıştırılabilir). Uzak projeye `db push --remote --include-seed`. Vitest seed.sql'in CSV'lerle eşit olduğunu denetler. |
| 9 | `placement.json` | Veritabanına yazılmaz (SPEC Ek C: "soru bankası dosyadadır"); M9 dosyadan okur. Biçim SPEC 5.2 `GeneratedItem` ile aynı (`payload` + `key`). Dinleme türlerinde seslendirilen metin `key.correct`'te, `payload`'da değil (PLAN #14 ile uyumlu). |
| 10 | `l1_codes.topic_id` (PLAN #13) | SPEC'e sadık kalındı: tek değer, Ek B'deki ilk konu birincil (`PREP_IN_ON_AT` → `g.prep_time`, `SIMPLE_CONT` → `g.present_simple`). `topics`'e "ilgili kodlar" alanı **eklenmedi**; bkz. açık soru 1. |
| 11 | Türler | `lib/db/types.ts`, Docker olmadan yerel Postgres'e karşı `supabase gen types typescript --remote=<db-url>` ile üretildi. |
| 12 | Dal | Oturum ortamı `claude/upbeat-feynman-lfib5u` dalını zorunlu kılıyor (`CLAUDE.md`'deki `m3-schema` yerine). |

## 3. Dosyalar

| Dosya | Ne |
| --- | --- |
| `supabase/migrations/20261111150000_m3_full_schema.sql` | Şema + RLS |
| `supabase/seed/topics.csv` | 32 konu (Ek A); `title_en`, `description_tr`, `prereqs` taslak |
| `supabase/seed/l1_codes.csv` | 24 kod (Ek B) |
| `supabase/seed/placement.json` | 14 yerleştirme sorusu (Ek C), `status: "draft"` |
| `supabase/seed.sql` | CSV'lerden üretilmiş upsert |
| `scripts/lib/seed.ts`, `scripts/build-seed.ts` | CSV ayrıştırıcı, yükleyiciler, SQL üretici |
| `lib/content/activity-types.ts` | `SKILLS`, `MODES`, `PURPOSES`, `ROLES`, `ACTIVITY_TYPES`, `ACTIVITY_TYPE_INFO` |
| `lib/content/interests.ts` | 12 ilgi alanı + Türkçe etiketler |
| `lib/db/types.ts` | Üretilmiş veritabanı türleri |
| `tests/content/{seed,placement,constants}.test.ts` | İçerik, yerleştirme ve sabit ↔ `check` kısıtı eşitliği |
| `tests/db/rls.sql`, `tests/db/supabase-stub.sql`, `tests/db/README.md` | RLS / seed / silme zinciri doğrulaması (geri alınan işlem) |

## 4. M3 "Bitti testi" eşlemesi

| ROADMAP maddesi | Kanıt |
| --- | --- |
| Seed sayıları: 32 konu, 24 kod, 14 yerleştirme sorusu | `tests/content/*.test.ts` + `tests/db/rls.sql` (1) |
| `L1.LITERAL` dışındaki her `L1.*` kodunun `topic_id`'si var | `seed.test.ts` + `rls.sql` (2) |
| Öğrenci rolüyle `select * from item_keys` → 0 satır | `rls.sql` (3) — yerelde geçti; `dev`'de yeniden koşulacak |
| Security Advisor'da RLS'i kapalı tablo yok | `rls.sql` (9) yerelde; Advisor `dev`'e push sonrası elle |
| Pedagoji sahibi onayı (P1, P2) | insan işi |

## 5. Elle yapılacaklar

1. `dev`'e uygula ve doğrula:
   - `npx supabase link --project-ref <dev-ref>`
   - `npx supabase db push --remote --include-seed`
   - `psql "<dev-db-url>" -v ON_ERROR_STOP=1 -f tests/db/rls.sql` (işlem sonunda geri alınır)
   - Supabase panelinde Security Advisor: RLS kapalı tablo yok.
2. Ana dala birleştikten sonra `prod`'a aynı komutlarla; ardından bağlantıyı `dev`'e geri al.
3. Pedagoji sahibi `topics.csv`, `l1_codes.csv`, `placement.json`'ı onaylar (P1, P2, P5); değişiklik olursa `npx tsx scripts/build-seed.ts` ve yeniden `db push --include-seed`.

## 6. Açık sorular

1. **PLAN #13:** Ek A'da sekiz kod iki konuya bağlı (ör. `HE_SHE` → `subject_pronouns` ve `object_pronouns`; `THERE_HAVE` → `there_is_are` ve `have_has`), ama `l1_codes.topic_id` tek değer. M4'ün teşhis motoru bu ikinci bağlantıyı kullanacaksa `topics.l1_codes text[]` (yeni göç + SPEC değişikliği) gerekir. Öneri: M4 planında karar.
2. **P2:** ROADMAP "her koda 2 yanlış/doğru örnek" diyor, şemada tek `wrong_example` / `right_example` var. Şimdilik birer örnek (bazılarında " / " ile iki örnek). İkinci örnek gerekirse alan dizi olur (SPEC değişikliği).
3. **Öğretmen kapsamı:** öğrenci tablolarında öğretmen tüm kohortları görüyor. Kohortla sınırlamak istenirse M2'de `profiles.cohort_id` üzerinden politika güncellenir.

## 9. Sonraki taşlar için açık kararlar

Bunlar M1'i etkilemez. Önerilen varsayılanlar **onaylanmadı**; her biri ilgili taşın planında yeniden sorulur. Çoğu SPEC değişikliği gerektirir.

| # | Taş | Sorun | Önerilen varsayılan |
| --- | --- | --- | --- |
| 13 | M3 | `l1_codes.topic_id` tek değer, ama sekiz kod iki konuya bağlı; `topics`'te "ilgili kodlar" alanı yok | `topic_id` birincil konu; `topics`'e `l1_codes text[]` |
| 14 | M5/M7 | Dinlemede seslendirilen metin (`payload.text_en`) öğrenciye açık; cevap sızar | Dinleme türlerinde metin `item_keys`'te |
| 15 | M5/M6 | Günlük sınır üretimde denetlenince ön üretim engelleniyor; saat dilimi tanımsız | Sınır `start`'ta denetlenir; Europe/Istanbul |
| 16 | M5/M6 | Üretim zaman aşımı 120 sn + yeniden deneme, `maxDuration = 120`'ye sığmıyor | `finish` için `maxDuration = 300` |
| 17 | M6/M10 | `generating` durumu yok (çift üretim); cron'daki "yeniden planla" için durum yok | `generating` eklenir; bayat `ready` → `abandoned` |
| 18 | M8 | PRD önce transkripti gösteriyor, API transkript + değerlendirmeyi tek çağrıda dönüyor | İki deneme de değerlendirilir, ustalığa sonuncusu işlenir |
| 19 | M4 | Sesletim konuları yalnızca dinle-seç ile ölçülüyor; odak ve teşhis kuralları uygulanamıyor | Odak olmaz; yalnızca tekrar/kapsama; TTS kapalıyken atlanır |
| 20 | M4 | `topic_gap` dalı yazıldığı hâliyle erişilemez; eşik `<` / `≤` farkı; "5/6" sıraya bağlı | Kurallar sırayla; `≤ 0,45`; testler SPEC'teki sırayı kullanır |
| 21 | M6/M7 | Profil güncelleme ve olay yazma uç noktaları yok | `PATCH /api/profile`, `POST /api/events` |
| 22 | M9 | Yerleştirme tohumlaması ve "3 zayıf konu" seçimi tanımsız | Normal kanıt gibi işlenir; en düşük ustalıklı üç konu |
| 23 | M6 | Açıklama modu "kısa"ya geri dönmüyor | Aynı kural tersine de işler |
