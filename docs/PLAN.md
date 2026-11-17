# PLAN — M7 (Dinleme) + M8 (Konuşma)

| | |
| --- | --- |
| Tarih | 17 Kasım 2026 |
| Kapsam | `ROADMAP.md` M7, M8 · `SPEC.md` 2, 3 (`tts_cache`, `llm_usage`, `app_settings`), 4.4 adım 8, 4.6, 5.1, 5.4, 6, 10, 11 · `PRD.md` F5, F6 |
| Dal | `claude/lucid-gauss-ftnatn` (bulut oturumunun zorunlu dalı; CLAUDE.md'deki `m7-…` adı yerine) |
| Bağımlılık | M6 (oturum akışı), M5 (guard, `gradeFreeAnswer` zaten `speak_answer`'ı destekliyor), M4 (dikte puanı) |
| Başlangıç | `npx tsc --noEmit` ✅ · `npm test` ✅ 26 dosya, 774 test (`1a46e84`) |
| Durum | Kod tamam, 819 test yeşil, göç dev + prod'da. Bitti testinde M7 3/5, M8 1/5 işaretli; kalanlar ses seçimi (P9), ses kayıtları (P6), sağlayıcı anahtarı ve telefon denemesi bekliyor (Bölüm 6) |

İki taş birlikte planlandı: ikisi de M6'nın geçici metin bayrağını (`lib/session/fallback.ts`) kaldırıyor ve aynı uç nokta/bileşen düzenine dokunuyor.

## 1. Durum tespiti (17.11.2026)

- M1–M5 ✅. M6: kod ana dalda; Bitti testinde 2 madde elle kontrol bekliyor (uç nokta süresi, ağ sekmesinde anahtar). Aşağıda Bölüm 7.
- `bibo-dev`: `tts_voice = null` (P9 ses seçimi yapılmadı), Storage'da kova yok.
- Bu bulut oturumunda `OPENROUTER_API_KEY` ve `SPEECHIFY_API_KEY` yok: gerçek sağlayıcı çağrısı yapılamaz; doğrulama sahte HTTP ile birim testlerde.

## 2. M7 — Dinleme

| Parça | Dosya |
| --- | --- |
| Göç: özel `tts` kovası (yalnızca `audio/mpeg`, 1 MB), `tts_chars_since()` | `supabase/migrations/20261117120000_m7_m8_audio.sql` |
| Speechify istemcisi: gövde, SSML (A1 `prosody rate="-10%"`), XML kaçışı, base64 çözme, 402/429 | `lib/tts/speechify.ts` |
| Önbellek ve akış: `sha256(model\|voice\|rate\|text)`, `tts_cache`, kovaya yazma, 1 saatlik imzalı URL, guard + `llm_usage` (`purpose = tts`, `provider = speechify`, `tts_chars`), aylık karakter uyarısı | `lib/tts/cache.ts`, `lib/tts/store.ts` |
| `GET /api/items/:id/audio` → `{ url }` / `503 tts_unavailable` | `app/api/items/[id]/audio/route.ts`, `service.getItemAudio` |
| Planlayıcı: geçici bayrak kalkar; dinleme `ttsAvailable()` ile açılır | `service.prepareSession` |
| `ListenChoose`, `Dictation`, ortak `AudioPlayer` (en çok 3 dinleme, `audio_replay`) | `components/activity/*` |
| Ses seçimi yardımcısı (P9): aday sesleri listeler, A1/A2 örnek mp3 üretir | `scripts/tts-voices.ts` |

## 3. M8 — Konuşma

| Parça | Dosya |
| --- | --- |
| WAV kodlama/okuma ve örnek azaltma (saf, testli) | `lib/audio/wav.ts` |
| Kaydedici: Web Audio, mono, istemcide 16 kHz'e azaltma, 45 sn sınırı, sessizlikte durmaz | `lib/audio/wav-recorder.ts` |
| Transkript arayüzü (guard + `llm_usage`, `purpose = transcribe`, `audio_seconds`) + MAI-Transcribe-2 | `lib/stt/index.ts`, `lib/stt/mai.ts` |
| `POST /api/items/:id/speech` (multipart, ≤ 2 MB, ≤ 45 sn, 16 kHz mono 16 bit WAV doğrulaması) | `app/api/items/[id]/speech/route.ts`, `service.submitSpeech` |
| `SpeakAnswer` (bas-başlat / bas-bitir, transkript, 1 yeniden kayıt) | `components/activity/SpeakAnswer.tsx` |
| `eval-verbatim` (20 hatalı okuma + 10 aksanlı doğru cevap; maliyet raporlu) | `scripts/eval-verbatim.ts` |
| Geçici bayrağın silinmesi | `lib/session/fallback.ts` silinir |

## 4. Alınan kararlar (insiyatifle; SPEC önerisi Bölüm 6)

| # | Konu | Karar | Gerekçe |
| --- | --- | --- | --- |
| 24 | Transkript sağlayıcısı | MAI-Transcribe-2 **OpenRouter üzerinden** (`microsoft/mai-transcribe-2`, `/audio/transcriptions`), `language: "en"`, `transcribeStyle` yok | SCOPE günlüğü 11.11.2026 ve SPEC 9 (`OPENROUTER_API_KEY` transkripti de kapsıyor); Azure anahtarı ortamda yok. SPEC 1, 2, 5.1, 10'daki Azure ifadeleri eski |
| 25 | Seslendirme ne zaman "kullanılamaz" | `tts_enabled = false` **ya da** `tts_voice` boş **ya da** son 24 saatteki son `tts` çağrısı 402/429 | SPEC "402/429 → `tts_enabled = false` gibi davran" diyor ama ne kadar süre demiyor. Ayarı kendiliğinden yazmak yerine `llm_usage`'dan türetilir; 24 saat sonra kendiliğinden yeniden denenir, başarılı çağrı durumu sıfırlar |
| 26 | `tts_voice` boşken | Dinleme kapalı (metne düşer) | P9 tamamlanana kadar güvenli varsayılan; ses seçilince yalnızca ayar değişir |
| 27 | Seslendirme maliyeti | `llm_usage.cost_usd = 0`, `tts_chars` dolu | Plan ücreti `tts_plan_usd` ile tavana zaten ekleniyor; Free planda aşım yok (istek reddedilir) |
| 18 | İki konuşma denemesi | İki deneme de transkript + değerlendirme alır, ikisinin `error_events`'i yazılır; **ustalığa sonuncusu işlenir**: 2. deneme gelirse hemen, gelmezse 1. deneme `finish`'te. Teşhis ve özet her etkinliğin son denemesini sayar | PLAN #18 önerilen varsayılan |
| 28 | Anlaşılmayan kayıt (`unclear`: < 2 kelime) | Deneme yazılır (`is_correct = null`), "Seni net duyamadık" + yeniden kayıt | Hak tüketir ama ustalığı bozmaz |
| 29 | Transkript yapılamazsa (guard, zaman aşımı) | `503 transcribe_unavailable`, deneme yazılmaz, hak tüketilmez | Öğrencinin suçu değil |
| 30 | Ses çalma (iOS) | İmzalı URL etkinlik açılınca alınır; "Dinle" dokunuşu doğrudan `play()` çağırır | iOS Safari `await` sonrasında dokunuş iznini düşürebilir |

## 5. Testler

`tests/tts/*` (gövde, SSML/kaçış, önbellek isabeti tek `tts` satırı, 402 → kullanılamaz ve sonraki plan dinlemesiz, ses yokken kapalı), `tests/audio/wav.test.ts`, `tests/stt/mai.test.ts`, `tests/session/service.test.ts` (ses uç noktası anahtar sızdırmıyor, konuşma akışı, #18), planlayıcı dinleme/konuşma slotları.

## 6. Sonuç (17.11.2026)

**Doğrulama:** `npm run lint` ✅ · `npx tsc --noEmit` ✅ · `npm test` ✅ 30 dosya, 819 test (önce 774) · `npm run build` ✅ (yeni yollar `/api/items/[id]/audio`, `/api/items/[id]/speech`; istemci paketinde sağlayıcı anahtarı, Speechify/transkript adresi ya da `item_keys` yok).

**Kaydedici (Chromium, sahte mikrofon, Playwright):** bağlam 44,1 kHz açıldı → gönderilen WAV 16 kHz, mono, 16 bit, 1,95 sn, sunucu doğrulamasından geçti (`isAcceptedWav = true`). iOS/Android gerçek cihaz denemesi Bölüm 6.3'te.

**Göç `20261117120000_m7_m8_audio`:** `bibo-dev` ve `bibo-prod`'a uygulandı (`schema_migrations` kaydıyla; iki ortamda 7 göç). Kontrol: `tts` kovası özel, 1 MB, yalnızca `audio/mpeg`; Storage'da `tts` politikası 0; `authenticated` `tts_chars_since`'i çağıramıyor; `storage.objects` boş.

### 6.1 Bitti testi

| Taş | Madde | Durum | Kanıt |
| --- | --- | --- | --- |
| M7 | Aynı metin ikinci kez → TTS çağrılmıyor, tek `tts` satırı | ✅ | `tests/tts/tts.test.ts` "aynı metin ikinci kez…", `tests/session/service.test.ts` "aynı etkinlik yeniden açılınca…" |
| M7 | A1 0,9 (`-10%`), A2 1,0; `&` içeren metin hatasız | ◐ | Hız ve kaçış testli; **gerçek Speechify'ın kaçışlı SSML'i okuması elle** (anahtar yok, ses seçilmedi) |
| M7 | Dikte puanlaması M4 ile tutarlı | ✅ | Servis üzerinden "She play football every day" → 0,80, yanlış (`service.test.ts` "M7 Bitti testi 3") |
| M7 | Sahte 402 → açık oturum kırılmıyor, sonraki oturum dinlemesiz | ✅ | `service.test.ts` "M7 Bitti testi 4", `tts.test.ts` "402 sonrası…" |
| M7 | iOS Safari / Android Chrome ses çalıyor; 4. dinleme engelli | ⏳ | Elle (6.3); sayaç kodda (`AudioPlayer`, `MAX_PLAYS = 3`) |
| M8 | `eval-verbatim` ≥ %85 | ⏳ | Betik hazır; P6 kayıtları ve `OPENROUTER_API_KEY` gerekli. Tahmini maliyet < 0,02 $ |
| M8 | Aksanlı doğru 10 cevapta ceza yok | ⏳ | Aynı betik (`kind: "accent"`) |
| M8 | iOS/Android mikrofon, sessizlikte durmama, iOS'ta 16 kHz | ◐ | Chromium'da 44,1 → 16 kHz; sessizlik algılama kodda yok; sunucu 16 kHz dışını reddeder. Gerçek cihaz elle |
| M8 | Ses Storage'a/diske yazılmıyor | ✅ | Kod: konuşma yolunda (`lib/session`, `lib/stt`, `lib/audio`, `app/api/items`) yazma çağrısı yok; ses yalnızca `Uint8Array`; `tts` kovası `audio/mpeg` dışını kabul etmez; `storage.objects` boş |
| M8 | Transkript + değerlendirme p90 ≤ 6 sn | ⏳ | `eval-verbatim` aksan kümesi ölçer; uç nokta süresi önizlemede elle |

### 6.2 Çalıştırılacak (anahtarla, mühendisin makinesinde)

```bash
npx tsx --env-file=.env.local scripts/tts-voices.ts
```

Listeden 2–3 aday seçilir, örnekler üretilir (`--sample id1,id2,id3`, Free kotadan ≈ 720 karakter, 0 $), pedagoji sahibi seçer, `tts_voice` yazılır (P9). Bundan önce dinleme etkinlikleri planlanmaz.

```bash
npx tsx --env-file=.env.local scripts/eval-verbatim.ts
```

P6 kayıtları `scripts/data/verbatim/` altına (repoya girmez), liste `manifest.json` (`manifest.example.json` biçiminde). Tahmini maliyet < 0,02 $.

### 6.3 Elle kontrol (telefon)

1. iOS Safari ve Android Chrome: dinle-seç ve dikte sesi çalıyor; 3 dinlemeden sonra düğme kapanıyor; A1 hesabında yavaş, A2'de normal hız.
2. Aynı cihazlar: "Kaydı başlat" mikrofon izni ister; 10 sn sessiz kalınca kayıt sürüyor; 45 sn'de kendiliğinden bitiyor; transkript gösteriliyor; "Yeniden kaydet" bir kez çıkıyor.
3. iOS'ta gönderilen WAV 16 kHz: sunucu başka biçimi `400` ile reddettiği için kaydın kabul edilmesi yeterli kanıt.
4. `tts_voice` boşken oturumda dinleme etkinliği yok; ses seçildikten sonraki oturumda var.
5. Mikrofon izni reddedilince Türkçe yönlendirme mesajı.

### 6.4 SPEC önerileri (uygulanmadı; onay bekliyor)

| Bölüm | Öneri |
| --- | --- |
| 1, 2, 5.1, 8, 10, 11 | Transkript OpenRouter üzerinden (`microsoft/mai-transcribe-2`, `/audio/transcriptions`, `language: "en"`); `lib/stt/mai.ts` gövdesi buna göre. Azure ifadeleri "doğrudan bağlantıya dönülürse" notuna. KVKK satırı: transkript işleme yeri OpenRouter → Microsoft (SCOPE günlüğündeki açık nokta) |
| 3 `app_settings` | `tts_voice` boşken dinleme kapalı (karar 26) |
| 5.4 | 402/429 sonrası 24 saat dinlemesiz; `llm_usage`'dan türetilir, ayar yazılmaz (karar 25). Seslendirme satırlarında `cost_usd = 0` (karar 27) |
| 6 | `GET …/audio` hata kodu `tts_unavailable` (503) ve yeni `transcribe_unavailable` (503) hata kodları tablosuna; `speech` yanıtına `errorNameTr`, `tryNo`, `canRerecord`; `maxDuration = 60` (audio, speech) |
| 5.1 / 6 | Karar 18 ve 28 (iki deneme, son değerlendirilmiş deneme ustalığa; anlaşılmayan kayıt) |
| 2 dizin | `components/activity/AudioPlayer.tsx`, `lib/audio/wav.ts`, `lib/tts/store.ts`, `scripts/tts-voices.ts`, `scripts/lib/verbatim.ts` |

### 6.5 v2 önerileri

- Dinleme hakkının sunucuda sayılması (şu an istemcide; yenilemede sıfırlanır).
- Sayfa yenilenince konuşma etkinliğinde yeniden kayıt hakkının korunması (şu an 1. denemeden sonra yenilenirse sonraki etkinliğe geçer).
- Günlük cron'a 21 gün kullanılmayan `tts/` nesnelerinin silinmesi M10'da (SPEC 6, zaten kapsamda).

## 7. M6 kapanışı (önceki plan, açık maddeler değişmedi)


### 1. Başlangıç durumu (17.11.2026, `cbcb859`)

- `npx tsc --noEmit` ✅ (temiz klonda önce `npx next typegen`: `RouteContext` / `LayoutProps` global türleri `.next/types`'ta üretilir)
- `npm test` ✅ 25 dosya, 765 test · `npm run lint` ✅

### 2. Bitti testi: açık maddeler

### 2.1 Yerel değerlendirme ≤ 1 sn; yapay zekâ değerlendirmesi p90 ≤ 6 sn

**Yapay zekâ (model çağrısı):** `bibo-dev` `llm_usage`, `purpose = 'grade'`, yalnızca sayısal sütunlar:

| Kaynak | n | ok | p50 | p90 | en çok |
| --- | --- | --- | --- | --- | --- |
| Uygulama (16.11.2026, gerçek telefon oturumları) | 17 | 17 | 2,6 sn | 3,8 sn | 5,8 sn |
| `eval-tagging` (15.11.2026) | 94 | 94 | 2,5 sn | 3,1 sn | 6,1 sn |

Model çağrısı hedefin içinde. Ancak madde öğrencinin gördüğü süreyi kastediyor (uç noktanın baştan sona süresi: model + veritabanı yazmaları). Vercel Hobby çalışma zamanı loglarını 1 saat tuttuğu için 16.11 isteklerinin süresi okunamadı. → **Elle kontrol 1.**

**Yerel:** puanlama saf fonksiyon (`lib/engine/grade-local.ts`); süreyi veritabanı gidiş-dönüşleri belirler (`6fb56f3`'te paralelleştirildi). Ölçüm yok. → **Elle kontrol 1.**

### 2.2 Ağ sekmesinde hiçbir yanıtta cevap anahtarı görünmüyor

Kod incelemesi:
- `item_keys`: RLS açık, politika yok (admin dahil); `tests/db/rls.sql` öğrenci/öğretmen/admin için 0 satır doğruluyor. Okuma yalnızca servis istemcisiyle `getItemKey()`.
- `items` ve `attempts` sütunları açıkça seçiliyor (`lib/session/store.ts`, `select *` yok); istemciye `toItemPublic` / `toAttemptPublic` gidiyor (`l1_target`, `graded_by`, `explanation_long_tr` yok). `tests/session/service.test.ts` "etkinlikler sırayla ve cevap anahtarı olmadan döner" alan adlarını ve anahtar metinlerini denetliyor.
- Dinleme türlerinde `text_en` kayıtta `item_keys`'e taşınıyor (`lib/session/save-items.ts`, PLAN karar 14).
- `word_order`: `tokens` sırası doğru cümleyse kod kontrolü reddediyor (`tokens_already_ordered`).
- `attempt` yanıtı doğru biçimi (`correction`) yalnızca o etkinliğe cevap verildikten sonra döner; ipucu yalnızca istenince.

**Bulunan sızıntı ve düzeltme (`4f5f831`):** `bibo-dev`'deki 10 `mcq_read` etkinliğinin **10'unda doğru şık ilk sıradaydı**; `McqRead` şıkları kayıt sırasıyla gösterdiği için cevap hem yanıtta hem ekranda belliydi. Artık `mcq_read` ve `listen_choose` şıkları kayıt sırasında sunucuda karıştırılıyor (oturum kimliğiyle tohumlu; anahtar şık metnini tuttuğu için puanlama değişmedi). Testler: `tests/session/pure.test.ts` (doğru şık 200 tohumda her konuma düşüyor, şıklar aynı, kaynak nesne değişmiyor). Not: `bibo-dev`'de daha önce üretilmiş etkinlikler eski sırada kalır; yeni üretilen oturumlar karışık gelir.

Gerçek ağ trafiğinin kontrolü giriş gerektiriyor → **Elle kontrol 2.**

### 2.3 `eval-generation` yeniden çalıştırması

`b2770bf` üretim komutunu değiştirdi (`instruction_tr` kuralları, tek cevaplı boşluk). Şema geçerliliği %100 ve ≤ 0,02 $/oturum hedefleri yeniden doğrulanmalı. Bu oturumda OpenRouter anahtarı yok (bulut ortamında sağlanmadı); mühendisin makinesinde çalıştırılacak, tahmini maliyet ≈ 0,10–0,25 $:

```bash
npx tsx --env-file=.env.local scripts/eval-generation.ts
```

Çıktı `scripts/out/eval-generation.json` ve `scripts/out/review-sample.md` (pedagoji sahibine). Not: eval betiği `splitGeneratedItems`'ı kullanmadığı için şık karıştırmasından etkilenmez.

### 2.4 Bağımsız SPEC incelemesi (`98b82d4..efa508b`, 17.11.2026)

Mimari kuralların hepsi tuttu (`item_keys` sızmıyor, `select *` yok, her çağrı guard + `llm_usage`, loglarda içerik yok, ayarlar `app_settings`'ten, motor saf, yazmalar `requireUser()` sonrası servis istemcisiyle, `finish` `maxDuration = 300`). Bulgular ve sonuçları:

| # | Bulgu | Tür | Sonuç |
| --- | --- | --- | --- |
| 1 | `gap_fill` yanlış cevabı yapay zekâya gidiyor; SPEC'te yok | SPEC | SPEC rev. 4 "Boşluk hakemliği" (4.6, 5.1, Bölüm 3 tür tablosu, maliyet modeli), PRD F4 ve ROADMAP notu |
| 2 | Uzun modda kendiliğinden gösterilen açıklama `explain_open` olayı yazıyordu | hata | `?via=auto` → olay yok; `?via=dismiss` eski `?opened=0`'ın yerine (`service.ts` `getExplanation`, `FeedbackCard.tsx`) |
| 3 | `attempt` yanıtında `errorNameTr`, `null` değerler | SPEC | SPEC 6'ya yazıldı |
| 4 | `next` `active` oturumu da dönüyor | SPEC | SPEC 6'ya yazıldı |
| 5 | Yeni dizinler, hata kodları, `maxDuration` değerleri | SPEC | SPEC 2 dizin yapısı ve SPEC 6 hata kodları tablosu (M2 kodları dahil) |
| 6 | `finish` bozuk JSON'u `{}` sayıyordu | hata | `readOptionalJson` → 400 (`lib/api/respond.ts`, `tests/api/respond.test.ts`) |
| 7 | Yalnızca puan gönderilince not siliniyordu | hata | `setRating` yalnızca verilen alanları yazar |
| 8 | `prefetchNext` ilk adımları `after()` içinde yakalanmamış hata bırakabiliyordu | hata | `try/catch` + kısa günlük |

Doğrulama: `npm run lint` ✅ · `npx tsc --noEmit` ✅ · `npm test` ✅ 26 dosya, 774 test · `npm run build` ✅.

**`bibo-dev` veri kontrolü (Supabase, yalnızca sayılar):** 46 günlük etkinlikte `payload`'da SPEC 5.2 dışı alan 0, anahtar alanı adı 0; `word_order`'da sıralı gelen kelimeler 0; serbest türlerde model cevap `payload`'da 0; `gap_fill`'de cevabın cümlede başka yerde görünmesi 0. `mcq_read`'de doğru şık 10/10 ilk sırada: hepsi şık karıştırmadan (`4f5f831`) önce üretilmiş (son etkinlik 16.11.2026 20:05 UTC). `item_keys`: RLS açık, politika 0 (dev ve prod). `grade` çağrıları: n = 111, p90 3,16 sn (model süresi; uç nokta süresi değil).

**`bibo-prod`:** M6 göçü uygulandı (sürüm `20261116190528`, `schema_migrations` kaydıyla; prod'da oturum yoktu).

### 3. Elle kontrol

1. **Süre (bilgisayarda, önizleme, DevTools → Ağ):** bir oturumda `POST /api/items/<id>/attempt` isteklerinin "Time" sütunu. Yerel türler (`mcq_read`, `gap_fill`, `word_order`) ≤ 1 sn; serbest türler (`translate_tr_en`, `short_write`) en az 10 istekte p90 ≤ 6 sn.
2. **Anahtar (aynı oturumda):** `GET /api/sessions/<id>` ve `POST …/start` yanıtlarında `accepted`, `correct`, `distractors`, `model_answer_en`, `hint_tr` yok; `mcq_read` şıklarında doğru cevap her seferinde ilk sırada değil. `attempt` yanıtında yalnızca o etkinliğin sonucu var.
3. **iOS Safari:** bir oturum baştan sona (M10 cihaz listesinin ön denemesi).

### 4. Kapanış sırası

1. Elle kontrol 1–2 ve `eval-generation` → ROADMAP M6'daki iki kutu kanıtıyla işaretlenir.
2. ~~SPEC'e göre bağımsız diff incelemesi~~ ✅ 17.11.2026 (Bölüm 2.4).
3. ~~SCOPE işaretleri~~ ✅ 17.11.2026: Bölüm 5'teki "İşaretle" maddeleri; "Oturum üretimi" `eval-generation`'a, "Sekiz etkinlik türü" M7–M8'e bekliyor.
4. Ana dala PR (bu dal). Elle kontrol 1–2 ve eval sonrası ROADMAP'teki iki kutu işaretlenir; M6 o zaman kapanır.

### 5. SCOPE önerisi (uygulandı 17.11.2026; iki madde bekliyor)

M6 sonunda işaretlenebilecekler (her biri bitti testi kanıtına dayanır):

| SCOPE maddesi | Öneri | Gerekçe |
| --- | --- | --- |
| F3 Oturum üretimi (≤ 5 slot paralel, kod kontrolleri, slot yeniden üretimi) | İşaretle (eval yeniden geçerse) | M5'te ölçüldü; komut değiştiği için eval sonrası |
| F3 Önceden hazırlama (`after()`, p90 ≤ 60 sn), ≤ 2 sn açılış | İşaretle, not: "önizlemede 2 ölçüm" | p90 için örneklem küçük; asıl ölçüm `simulate` / pilot öncesi |
| F3 Sekiz etkinlik türünün arayüzü | **Bekle** | 5/8; dinleme M7, konuşma M8 |
| F3 Kaldığı yerden devam (24 sa), günlük sınır | İşaretle | Elle denendi; servis testleri |
| F3 İçeriğin %20'si genel | İşaretle | Planlayıcı (`general_content_rate`) ve testleri |
| F4 Kısa geri bildirim, doğru biçim, L1 karşılaştırması | İşaretle | Gerçek oturumlarda görüldü |
| F4 "Daha fazla açıkla" ve açıklama modu | İşaretle | Servis testleri (karar 23 dahil) |
| F4 Türkçe ipucu, ipuçlu cevap ≤ 0,5 | İşaretle | Servis testleri |
| F7 Hata etiketleme, `error_events` | İşaretle | Bitti testi maddesi 2 |
| F7 `activity_stats` toplanması | İşaretle | `applyCredit` + `retest` testi |
| F8 Özet, teşhis kartı, Doğru/Bence değil, 1–5 puan | İşaretle | Gerçek oturum + servis testleri |

### 6. Önceki taşlardan açık kalanlar

- ~~**`prod`:** M2 ve M6 göçleri~~ ✅ 17.11.2026: `bibo-prod` göç listesi dev ile aynı (6 göç).
- **SPEC önerileri (M2):** `lib/auth/*`, `lib/api/*`, `lib/onboarding/*` ve M2 hata kodları rev. 4'te SPEC'e girdi. Kalan: Bölüm 2'ye `(auth)/davet/page.tsx`, Bölüm 3'e `claim_invite`.
- **Supabase e-posta kaydı** panelden kapatılmalı; **gizlilik metni** yer tutucuları M10'dan önce.
- **Karar #18 (M8):** transkript gösterimi + iki deneme; önerilen varsayılan: iki deneme de değerlendirilir, ustalığa sonuncusu işlenir.
- **Karar #22 (M9):** yerleştirme tohumlaması ve "3 zayıf konu"; önerilen varsayılan: normal kanıt gibi, en düşük ustalıklı üç konu.
- **Gecikme ölçümü:** Vercel Hobby logları 1 saat; uç nokta süreleri için kalıcı kaynak yok. `Server-Timing` önerisi SCOPE v2 havuzuna yazıldı (17.11.2026).
