# PLAN — M5 (Yapay zekâ katmanı ve maliyet koruması)

| | |
| --- | --- |
| Tarih | 11 Kasım 2026 |
| Kapsam | `ROADMAP.md` M5 · `SPEC.md` Bölüm 5 (5.1–5.4), 3 (`llm_usage`, `app_settings`), 8 (maliyet modeli), 12 · `PRD.md` F3, F4, F12, Bölüm 8 |
| Durum | Uygulandı; çevrimdışı Bitti testi maddeleri Vitest ile yeşil. `eval-generation` 11.11.2026'da geçti (karar 13). `eval-tagging` P4 altın setini, örneklem incelemesi pedagoji sahibini bekliyor. |
| Bağımlılık | M3 (şema, seed), M4 (`PlanSlot`, `ItemKey`, normalizasyon). M4 dalı (`claude/m4-analysis-implementation-2449d8`) bu dala ileri sarıldı; ana dala henüz birleşmemişti. |

M1, M3 ve M4 planları bu dosyanın git geçmişinde (`80efea6`, `b4d6af6`, `5ff06bf`).

---

## 1. Yaklaşım

- **Sağlayıcı:** SCOPE günlüğü (11.11.2026) gereği Claude Haiku 5.5 OpenRouter üzerinden (`anthropic/claude-haiku-5.5`, yalnızca Anthropic altyapısı, `data_collection: deny`). SPEC'teki `ai` + `@ai-sdk/anthropic` OpenRouter'a bağlanamadığı için **ince bir fetch istemcisi + Zod 4** kullanıldı (kullanıcı onayı, 11.11.2026). Tek yeni bağımlılık `zod@4.6.7`.
- `lib/ai/*` dosyalarının kararları saf fonksiyonlarda (şema dönüştürme, kod kontrolleri, maliyet, guard kararı); veritabanı ve ağ `AiStore` ve `fetch` arayüzleriyle enjekte edilir. Böylece guard ve üretim akışı veritabanı ya da API olmadan test edilir.
- Her çağrı tek yoldan geçer: `withAiCall()` → `guard` → çağrı → `llm_usage` satırı → `sessions.cost_usd`. Guard'ı atlayan yol yok.
- Konu ve hata kodu listesi (`TOPIC_IDS`, `L1_CODE_IDS`, kurallar) CSV'den üretilen `lib/content/taxonomy.ts` dosyasında; seed.sql gibi `scripts/build-seed.ts` üretir, test eşitliği denetler. Çalışma zamanında dosya okunmaz.

## 2. Dosyalar

| Dosya | Ne |
| --- | --- |
| `lib/content/taxonomy.ts` | ÜRETİLMİŞ: `TOPICS`, `L1_CODES`, `TOPIC_IDS`, `L1_CODE_IDS` (komut ve Zod enum'ları için) |
| `scripts/lib/seed.ts`, `scripts/build-seed.ts` | + `buildTaxonomyTs()`; build-seed iki dosyayı yazar |
| `lib/ai/schemas.ts` | `GeneratedItem`, `SessionGen`, `SlotRegen`, `GradeResult` (SPEC 5.2, `z.record` yok) |
| `lib/ai/json-schema.ts` | Zod → katı JSON şeması: `additionalProperties: false`; `maxLength`/`minItems`… gibi desteklenmeyen sınırlar açıklamaya taşınır (cevap yine Zod'la doğrulanır) |
| `lib/ai/settings.ts` | `app_settings` satırlarını türlü `AiSettings`'e çevirir (değerler koda sabit yazılmaz) |
| `lib/ai/cost.ts` | Fiyat tablosu (girdi, çıktı, önbellek okuma/yazma; transkript dakikası) ve `llmCostUsd()` |
| `lib/ai/client.ts` | OpenRouter chat çağrısı: model kimliği eşlemesi, `reasoning.effort`, `cache_control`, `json_schema` (strict), zaman aşımı, kullanım ayrıştırma, `refusal` tespiti. `temperature`/`top_p`/`top_k` yok |
| `lib/ai/guard.ts` | `evaluateGuard()` (saf, SPEC 5.4 sırası), `withAiCall()` (guard → çağrı → `llm_usage` → oturum maliyeti), `istanbulDayStart()`, `utcMonthStart()` |
| `lib/ai/store.ts` | `AiStore` arayüzü + Supabase uygulaması (servis istemcisi parametreyle gelir) |
| `lib/ai/checks.ts` | Üretim sonrası kod kontrolleri (SPEC 5.2) + slot/tür/konu eşleşmesi + türe göre zorunlu alanlar |
| `lib/ai/prompts/generate.ts`, `lib/ai/prompts/grade.ts` | Sabit sistem komutları (taksonomi, içerik kuralları, stil) + öğrenciye özgü son kısım |
| `lib/ai/generate-session.ts` | Tek çağrıda üretim → kontroller → başarısız slotlar için tek yeniden üretim → ≥ 8 kontrolü |
| `lib/ai/grade.ts` | Serbest cevap değerlendirme (`translate_tr_en`, `short_write`, `speak_answer` transkripti) |
| `supabase/migrations/20261111170000_m5_ai_usage_functions.sql` | `llm_cost_since(ts)`, `add_session_cost(uuid, numeric)`; yalnızca `service_role` çalıştırır |
| `scripts/eval-generation.ts`, `scripts/eval-tagging.ts`, `scripts/lib/eval.ts`, `scripts/lib/eval-env.ts` | Gerçek API; maliyet, gecikme (p50/p90), şema geçerliliği, uyum raporu |
| `scripts/data/golden.example.json` | Altın set biçimi (2 örnek). Gerçek 40 cümle P4 ile `scripts/data/golden.json`'a gelir |
| `scripts/hello-providers.ts` | Korundu: Speechify ve transkript için `lib/tts` / `lib/stt` M7–M8'de gelecek; o zaman silinir |
| `tests/ai/*.test.ts`, `tests/content/taxonomy.test.ts` | Bitti testinin çevrimdışı maddeleri |

## 3. Verilen kararlar (SPEC'te açık ya da OpenRouter'a uyarlanan noktalar)

| # | Konu | Karar |
| --- | --- | --- |
| 1 | SDK | İnce fetch istemcisi (yukarıda). Doğrudan Anthropic'e dönülürse yalnızca `lib/ai/client.ts` değişir. |
| 2 | Model kimliği | `app_settings` SPEC'teki Anthropic kimliğini tutar (`claude-haiku-5-5`); istemci `anthropic/claude-haiku-5.5`'e çevirir. `/` içeren değer olduğu gibi gönderilir (bir üst modele geçiş ayardan). |
| 3 | `llm_usage.provider` | `openrouter` (faturayı kesen); `model` = ayardaki kimlik. M10 panelinde "sağlayıcıya göre" kırılım buna göre. |
| 4 | Token alanları | Anthropic anlamı: `input_tokens` önbelleğe girmeyen girdi; `cache_read_tokens` / `cache_write_tokens` ayrı. OpenRouter `prompt_tokens`'ı toplam verdiği için çıkarılır. Maliyet yalnızca `cost.ts` ile; OpenRouter'ın `usage.cost` değeri yazılmaz (eval raporunda karşılaştırma için gösterilir). |
| 5 | Ay ve gün | Aylık tavan UTC ayı; günlük sınır Europe/Istanbul günü (UTC+3, yaz saati yok). |
| 6 | Günlük sınır | SPEC 5.4 harfiyen: `purpose = generate` ve `kind = daily` için bugün **başlatılan** (`started_at`) oturum sayısı `≥ daily_session_limit` → red. PLAN #15 (ön üretimin engellenmesi) M6'da ele alınacak. |
| 7 | Toplamlar | `sum(cost_usd)` PostgREST'in 1000 satır sınırına takılmasın diye SQL fonksiyonu; `sessions.cost_usd` yarışsız artırım için `add_session_cost`. |
| 8 | Yeniden deneme | İstemci: ağ hatası, zaman aşımı, 429/5xx'te bir kez. Üretim: JSON/şema geçersizse tüm çağrı bir kez; geçmeyen slotlar tek bir `SlotRegen` çağrısıyla bir kez. Her HTTP çağrısı kendi guard'ı ve `llm_usage` satırıyla. |
| 9 | `refusal` | Tüm üretim reddedilirse bir kez tekrar, yine red → `GenerationError('refusal')` (oturum `failed`). Slot yeniden üretimi reddedilirse o slotlar çıkarılır. Değerlendirmede `{ kind: 'refusal' }` döner; çağıran "Bu cevabı şu an değerlendiremedik" gösterir, ustalık güncellemez. |
| 10 | Kod kontrolleri | SPEC 5.2'dekiler + slot planla eşleşir (konum, tür, konu) + türe göre zorunlu alanlar + `gap_fill`'de tek `___` + dikte cümlesi `text_en` ile aynı + `target_words` cümlede. Cümle uzunluğu İngilizce alanlarda (metin, soru, şıklar, kabul edilenler, model cevap) cümle başına sayılır. |
| 11 | Değerlendirme çıktısı | Model `errors`/`evidence`'ta listede olmayan kod/konu döndüremez (enum). `errors` boşsa ve `is_correct = false` ise hata etiketi `GEN.OTHER` ile çağıran tarafta tamamlanır (M6). |
| 12 | Stil rehberi (P3) | Henüz yok; SPEC 5.3'teki kurallar komuta yazıldı. Rehber gelince `prompts/*` sistem metnine eklenir (önbellek bir kez yeniden yazılır). |
| 13 | Üretim şeması ve bölme (eval-generation sonrası, kullanıcı onayı 11.11.2026) | Katı şema `minItems > 1` desteklemediğinden model ilk çağrıların %20–50'sinde 8'den az etkinlik döndü. `SessionGen` artık slot anahtarlı (`{ slot_1: item, … }`, her anahtar zorunlu); 6+ slotlu şema Anthropic'te "Schema is too complex for compilation" verdiği için oturum en çok 5 slotluk paralel çağrılara bölünür (10 → 5+5, 9 → 5+4, 8 → 4+4), model yerel `slot_1…slot_k` görür. Şemadan kısmen geçen yanıtta geçerli slotlar tutulur; bozuk, eksik ya da reddedilen slotlar tek bir yeniden üretim turunda (yine ≤ 5'lik paralel parçalar) üretilir. `llm_usage.error` yalnızca yol/kod/sınır içerir (ör. `invalid_output:slot_4.key.hint_tr:too_big(max 140)`). **SPEC 5.1/5.2 önerisi:** "tek çağrı" ve `SessionGen` dizi tanımı bu biçimde güncellenmeli. |

## 4. Bitti testi eşlemesi

| ROADMAP maddesi | Kanıt |
| --- | --- |
| `eval-generation` 20 oturum, %100 şema, ≤ 0,02 $, p90 ≤ 60 sn | `npx tsx --env-file=<.env.local> scripts/eval-generation.ts` — **çalıştırılmadı** (onay + maliyet ≈ 0,10–0,25 $) |
| Pedagoji 20 etkinlik ≥ 18 uygun | eval-generation `scripts/out/review-sample.md` üretir — insan işi |
| `eval-tagging` ≥ %80 uyum, p90 ≤ 6 sn | `scripts/eval-tagging.ts` — P4 altın seti bekleniyor |
| `temperature`/`top_p` yok; ikinci çağrıdan itibaren `cache_read_tokens > 0` | `tests/ai/client.test.ts` (istek gövdesi) + kod incelemesi; önbellek isabeti eval-generation raporunda |
| Guard testleri | `tests/ai/guard.test.ts` |
| `llm_usage`'da içerik yok | `tests/ai/guard.test.ts` (satır yalnızca sayısal/kimlik alanları) |

## 5. Açık sorular

1. ~~SPEC'te OpenRouter + fetch istemcisi ve `provider = openrouter`.~~ SPEC rev. 3'te güncellendi (11.11.2026).
2. ~~OpenRouter komisyonu tavana dahil mi?~~ Evet: `app_settings.openrouter_fee_rate` (varsayılan 0,055, doğrulanacak), SPEC rev. 3. **Uygulanmadı:** göç + `cost.ts`/guard değişikliği gerekiyor.
3. ~~Göç `dev`'e uygulanmadı.~~ 11.11.2026'da `bibo-dev`'e uygulandı, `lib/db/types.ts` güncellendi (PR #6).
4. ~~PLAN #14 ve #15.~~ Karar verildi (aşağıdaki tablo); M6'da uygulanır.
5. ~~`reasoning.effort` ve `json_schema` (strict) doğrulanacak.~~ eval-generation'da doğrulandı; sınır: en çok 5 slotluk slot anahtarlı şema (karar 13).

## 9. Sonraki taşlar için açık kararlar

Karar (11.11.2026, SPEC rev. 3): #14, #15, #16, #17, #21 ve #23 önerilen varsayılanla kabul edildi; M6'da uygulanır. #18 ve #22 açık.

| # | Taş | Sorun | Önerilen varsayılan |
| --- | --- | --- | --- |
| 14 | M5/M7 | Dinlemede seslendirilen metin (`payload.text_en`) öğrenciye açık; cevap sızar | M6'da kayıt sırasında dinleme türlerinde `text_en` `item_keys`'e taşınır |
| 15 | M5/M6 | Günlük sınır üretimde denetlenince ön üretim engelleniyor | Sınır `start`'ta denetlenir; guard'a `prefetch` istisnası (SPEC değişikliği) |
| 16 | M5/M6 | Üretim zaman aşımı 120 sn + yeniden deneme, `maxDuration = 120`'ye sığmıyor | `finish` için `maxDuration = 300` |
| 17 | M6/M10 | `generating` durumu yok (çift üretim); cron'daki "yeniden planla" için durum yok | `generating` eklenir; bayat `ready` → `abandoned` |
| 18 | M8 | PRD önce transkripti gösteriyor, API transkript + değerlendirmeyi tek çağrıda dönüyor | İki deneme de değerlendirilir, ustalığa sonuncusu işlenir |
| 21 | M6/M7 | Profil güncelleme ve olay yazma uç noktaları yok | `PATCH /api/profile`, `POST /api/events` |
| 22 | M9 | Yerleştirme tohumlaması ve "3 zayıf konu" seçimi tanımsız | Normal kanıt gibi işlenir; en düşük ustalıklı üç konu |
| 23 | M6 | Açıklama modu "kısa"ya geri dönmüyor | Aynı kural tersine de işler |
