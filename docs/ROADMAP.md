# ROADMAP — Kaynak v1

| | |
| --- | --- |
| Sürüm | v1 (MVP / pilot) · 10 Kasım 2026 · rev. 3 (18 Kasım 2026: M11 eklendi — ölçme, öğrenme profili ve müfredat v2) |
| Yapı | 11 kilometre taşı (M1–M11), her biri tek odaklı çalışma oturumunda bitirilebilir ve kendi testiyle kapanır |
| Paralel iz | Pedagoji görevleri (P1–P9), mühendislik taşlarını besler |
| Kurallar | Kapsam `SCOPE.md`, teknik ayrıntı `SPEC.md`, kabul kriterleri `PRD.md`; Claude Code çalışma düzeni `CLAUDE.md` ve `/kilometre-tasi` komutunda |

---

## Genel bakış

| # | Kilometre taşı | Sonunda elinizde ne var | Bağlı olduğu | Pedagoji girdisi |
| --- | --- | --- | --- | --- |
| M1 | İskelet, hesaplar ve canlı ortam | Canlı URL, veritabanına bağlı sağlık kontrolü, tüm sağlayıcı anahtarları | — | — |
| M2 | Giriş, davet ve onam | Davetli kullanıcı Google ile girip rıza verebiliyor | M1 | P8 taslak |
| M3 | Tam şema ve içerik omurgası | Tüm tablolar, RLS, seed edilmiş konu ve hata kodları | M1 | P1, P2, P5 |
| M4 | Teşhis motoru | Testli, saf TypeScript ustalık + teşhis + planlayıcı | M3 (yalnızca kimlikler) | — |
| M5 | Yapay zekâ katmanı | Ölçülmüş maliyet ve gecikmeyle oturum üretimi ve serbest cevap değerlendirme | M3, M4 | P3, P4 |
| M6 | Oturum akışı (metin) | Telefonda baştan sona bir oturum + teşhis kartı | M5 | — |
| M7 | Dinleme | Önbellekli seslendirme, dinle-seç ve dikte | M6 | P9 |
| M8 | Konuşma | Bas-konuş, kelimesi kelimesine transkript, değerlendirme | M6 | P6 |
| M9 | Başlangıç ve ilerleme | Yerleştirme testi, tahmini zayıf noktalar, ilerleme ekranı | M6 (M7, M8 tercihen) | P5 |
| M10 | Yönetim ve pilot hazırlığı | Öğretmen kuyruğu, maliyet paneli, acil durdurma, pilot kapısı | M9 | P8 son |
| M11 | Ölçme ve müfredat v2 | Uyarlamalı yerleştirme + kapsam kapısı, Bayesçi öğrenme profili, müfredat motoru, kesinlik öncelikli değerlendirme, kalibrasyon | M10 | P10–P13 |

```mermaid
flowchart LR
  M1 --> M2
  M1 --> M3
  M3 --> M4
  M3 --> M5
  M4 --> M5
  M5 --> M6
  M6 --> M7
  M6 --> M8
  M7 --> M9
  M8 --> M9
  M2 --> M9
  M9 --> M10
  M10 --> M11
  M11 --> PILOT((Pilot))
```

M2 ile M3–M4 birbirinden bağımsızdır; sıra değiştirilebilir.

---

## M1 — İskelet, hesaplar ve canlı ortam

**Amaç:** Boş ama canlı, dağıtım hattı çalışan bir uygulama; sonraki taşların ihtiyaç duyacağı tüm hesaplar ve anahtarlar hazır.

**Kapsam**
- `create-next-app` (Next.js 16.4, TypeScript, Tailwind 4, App Router), `shadcn` başlatma.
- Repo kökünde `CLAUDE.md`, `.claude/` ve `docs/` (dört belge) yerleştirilir.
- Supabase `dev` ve `prod` projeleri (Frankfurt), Supabase CLI, ilk göç: `cohorts`, `profiles`, `app_settings` (`SPEC.md` Bölüm 3'teki varsayılan değerlerle).
- Vercel projesi (`fra1`), ortam değişkenleri (`SPEC.md` Bölüm 9), PR önizlemeleri `dev`'e.
- Sağlayıcı hesapları (insan işi, Claude Code yapamaz): Anthropic Console (ön ödemeli kredi + aylık harcama limiti 40 $), Azure for Students aboneliği + Speech kaynağı (`northeurope`) + 10 $ bütçe uyarısı, Speechify API (Free plan), Google Cloud OAuth istemcisi. Anahtarlar `.env.local` ve Vercel'e girilir; repoya girmez.
- `GET /api/health` → veritabanına `select 1`.
- Vitest ve `tsx` kurulumu, bir örnek test; kısa README; `.env.example` (değersiz).

**Bitti testi**
- [x] Prod URL açılıyor; `/api/health` → `{ "db": "ok" }`.
- [x] Bir PR açıldığında önizleme URL'si oluşuyor ve `dev` veritabanına bağlanıyor.
- [x] `npm test` yeşil.
- [x] Hiçbir sır istemci paketinde yok (`NEXT_PUBLIC_` dışı değişkenler tarayıcıda görünmüyor); `.env*` dosyaları `.gitignore`'da.
- [x] Üç sağlayıcı anahtarıyla birer "merhaba" çağrısı yerelde çalışıyor (Claude kısa metin, Azure 3 sn'lik WAV, Speechify tek cümle) ve maliyetleri sağlayıcı panellerinde görünüyor. _(11.11.2026: Claude ve transkript OpenRouter üzerinden, Azure yerine MAI-Transcribe-2 Speechify mp3 ile; bkz. SCOPE günlüğü)_

---

## M2 — Giriş, davet ve onam

**Amaç:** Yalnızca davetli öğrenciler girebilsin, rızaları kayıtlı olsun.

**Kapsam**
- Google Cloud OAuth istemcisi + Supabase Google sağlayıcısı; `@supabase/ssr`; `proxy.ts`.
- `/giris`, `/davet/[code]`, `/auth/callback`; yeni kullanıcıda `profiles` satırı (veritabanı tetikleyicisi).
- `onboarding_step` kapısı; `/baslangic/onam` (18+ beyanı + açık rıza); `/gizlilik` taslağı.
- `POST /api/onboarding/invite`, `POST /api/onboarding/consent`.
- `requireUser()`, `requireRole()`; `profiles` ve `cohorts` RLS politikaları.
- `DELETE /api/account` (erken eklemek ucuz, sonradan unutulması pahalı).

**Bitti testi**
- [x] Davet kodu olmadan giriş yapan kullanıcı onam sayfasına geçemiyor. _(16.11.2026: önizlemede gerçek Google girişiyle; `/baslangic/onam` → `/davet`)_
- [x] Kapasite test için 1'e düşürüldüğünde ikinci kullanıcı `409` alıyor. _(16.11.2026: `bibo-dev`'de 1 kişilik dolu kohort; gerçek kullanıcı "kontenjan doldu" mesajını aldı, kohorta eklenmedi)_
- [x] Rıza sürümü ve zamanı `profiles`'ta. _(16.11.2026: `consent_version = 2026-11-pilot-v1`, `consent_at` ve `adult_confirmed_at` dolu)_
- [x] İki test kullanıcısıyla RLS: A, B'nin profilini okuyamıyor. _(15.11.2026: `tests/db/m2-auth.sql` `bibo-dev`'de 40/40)_
- [x] Hesap silme sonrası `auth.users` ve `profiles` satırı yok. _(16.11.2026: `DELETE /api/account` sonrası `bibo-dev`'de eski hesabın iki satırı da yok; yeniden girişte yeni hesap açıldı)_

---

## M3 — Tam şema ve içerik omurgası

**Amaç:** Bütün veri modeli ve pedagojik içerik veritabanında.

**Kapsam**
- `SPEC.md` Bölüm 3'teki kalan tüm tablolar, indeksler, `check` kısıtları ve RLS politikaları (`llm_usage` önbellek token alanları ve `app_settings`'in rev. 2 anahtarları dahil).
- `item_keys` için öğrenci/öğretmen `select` politikası **yok**.
- Seed: `topics.csv` (32), `l1_codes.csv` (24), `placement.json` (14); `interests` ve `activity-types` sabitleri.
- TypeScript türlerinin üretilmesi (`supabase gen types`).

**Bitti testi**
- [x] Seed sayıları: 32 konu, 24 kod, 14 yerleştirme sorusu.
- [x] `L1.LITERAL` dışındaki her `L1.*` kodunun geçerli bir `topic_id`'si var.
- [x] Öğrenci rolüyle `select * from item_keys` → 0 satır / izin hatası.
- [x] Supabase Security Advisor'da RLS'i kapalı tablo yok.
- [x] Pedagoji sahibi konu ve kod listesini onayladı (P1, P2 işaretli). _(11.11.2026: geçici onay — devam etmek için yeterli; pilot öncesi yeniden kontrol edilecek)_

---

## M4 — Teşhis motoru (saf TypeScript)

**Amaç:** Ürünün kalbi; dil modelinden ve veritabanından bağımsız, tamamen testli.

**Kapsam**
- `lib/engine/`: `types`, `normalize`, `grade-local`, `mastery`, aralıklı tekrar, `diagnosis`, `planner`, `effectiveness` (`SPEC.md` Bölüm 4).
- Planlayıcıda seslendirme kapalı durumu (`SPEC.md` 4.4 adım 8).
- Fikstür tabanlı testler.
- `scripts/simulate.ts`: "yazmada bilen, konuşmada bilmeyen" sentetik öğrenciyle sahte değerlendirme kullanarak 6 oturum.

**Bitti testi** (en az 25 Vitest testi, hepsi yeşil; şunlar zorunlu)
- [x] Yazma 5/6 + konuşma 1/4 → `skill_gap(speaking)`, güven ≥ 0,6.
- [x] Tüm ölçülen beceriler ≤ 0,45 ve toplam kanıt ≥ 6 → `topic_gap`.
- [x] Aynı konu ve beceride bir tür ≤ %35, diğeri ≥ %70 → `activity_mismatch`.
- [x] Tek cevap bir ustalık puanını en çok 0,25 değiştiriyor; ipuçlu cevap en çok 0,5 sayılıyor.
- [x] Planlayıcı her çağrıda 8–10 slot, 900–1200 sn, dört beceri ve (uygunsa) ≥ 1 çapraz tekrar üretiyor; `tts_enabled = false` iken dinleme slotu yok.
- [x] Dikte: hedef "She plays football every day", cevap "She play football every day" → 5 kelimede 1 hata, puan 0,80 → yanlış (eşik 0,9).
- [x] `simulate.ts`: en geç 5. oturumda güveni ≥ 0,6 `skill_gap(speaking)`.

---

## M5 — Yapay zekâ katmanı ve maliyet koruması

**Amaç:** İçerik üretimi ve serbest cevap değerlendirmesi; her kuruş ve her saniye ölçülü.

**Kapsam**
- `ai` + `@ai-sdk/anthropic`; `lib/ai/schemas.ts` (Zod, `z.record` yok — `SPEC.md` 5.2), `prompts/generate.ts`, `prompts/grade.ts`.
- Çağrı ayarları `SPEC.md` 5.1'e göre: `claude-haiku-5-5`, üretimde `effort = medium`, değerlendirmede `low`; `temperature` gönderilmez; sistem komutu `cacheControl` ile önbellekte.
- Üretim sonrası kod kontrolleri ve slot düzeyinde yeniden üretim; `refusal` durumunun ele alınması.
- `lib/ai/cost.ts` (fiyat tablosu, önbellek fiyatları dahil), `llm_usage` günlüğü, `lib/ai/guard.ts` (acil durdurma, aylık tavan + `tts_plan_usd`, günlük sınır).
- `scripts/eval-generation.ts`, `scripts/eval-tagging.ts` (maliyet ve gecikme raporlu).

**Bitti testi**
- [x] `eval-generation`: 4 profil × 5 oturum = 20 oturum, yeniden denemeyle %100 şema geçerli, ortalama ≤ 0,02 $/oturum (beklenen ≈ 0,005 $ yalnız üretim), üretim süresi p90 ≤ 60 sn. _(11.11.2026: 20/20, 0,0039 $/oturum, p50 20,6 sn, p90 30,0 sn; slot anahtarlı şema, en çok 5 slotluk paralel çağrılar — bkz. PLAN.md karar 13)_
- [x] Pedagoji sahibi 20 oturumdan rastgele 20 etkinliği inceledi: ≥ 18'i seviyeye ve kurallara uygun. _(13.11.2026: 20/20 uygun; notlar ve boş açıklama düzeltmesi `docs/pedagoji/M5-inceleme-sonucu.md`)_
- [x] `eval-tagging`: 40 cümlelik altın sette öğretmen etiketiyle ≥ %80 uyum. Değilse önce `effort_grade = medium`, yetmezse `model_grade` bir üst modele alınır, test tekrarlanır. _(15.11.2026: 94 cümlelik sette %94,7 (89/94), varsayılan ayarlarla — `docs/pedagoji/M5-altin-set-sonucu.md`)_
- [x] `eval-tagging`: değerlendirme p90 ≤ 6 sn. Değilse `thinking_grade = disabled` ile tekrar ölçülür ve uyum yeniden kontrol edilir. _(15.11.2026: p50 2,8 sn, p90 3,4 sn)_
- [x] İsteklerde `temperature` / `top_p` yok (kod incelemesi); ikinci çağrıdan itibaren `cache_read_tokens > 0`. _(11.11.2026: `tests/ai/client.test.ts`; eval-generation'da ilk çağrıdan sonraki tüm çağrılarda önbellek okuması var)_
- [x] Guard testleri: `kill_switch = true` → çağrı yok; ay içi maliyet + plan ücreti tavana eşit → çağrı yok; günlük sınır aşılınca üretim yok. _(11.11.2026: `tests/ai/guard.test.ts`, `tests/ai/generate-grade.test.ts`)_
- [x] `llm_usage` satırlarında komut ya da öğrenci metni yok. _(11.11.2026: `tests/ai/guard.test.ts`)_

---

## M6 — Oturum akışı (metin etkinlikleri)

**Amaç:** Bir öğrenci telefonundan baştan sona bir oturum yapabilsin ve teşhis kartını görsün.

**Kapsam**
- `POST /api/sessions/next`, `GET /api/sessions/:id`, `start`, `POST /api/items/:id/attempt`, `hint`, `explanation`, `finish` (+ `after()` ile sonraki oturum, `maxDuration = 300`), `diagnoses/:id/feedback`, `PATCH /api/profile`, `POST /api/events`.
- `sessions.status`'a `generating` (göç; öğrenci başına tek `generating`/`ready` oturum); günlük sınır `start`'ta; dinleme türlerinde `text_en` `item_keys`'e (SPEC rev. 3).
- `/oturum/[id]` sayfası, ilerleme çubuğu, beş metin bileşeni: `McqRead`, `GapFill`, `WordOrder`, `Translate`, `ShortWrite`.
- Kaldığı yerden devam; oturum özeti; teşhis kartı; 1–5 puan.
- Geçici bayrak: dinleme ve konuşma slotları bu taşta metin türlerine düşürülür (M7–M8'de kaldırılır; dinleme için aynı mekanizma `tts_enabled` ile kalıcı olur).

**Bitti testi**
- [x] Gerçek telefonda bir oturum baştan sona tamamlanıyor. _(16.11.2026: önizlemede telefonda iki oturum; 10/10 ve 9/9 cevap)_
- [x] Her cevap için `attempts`, gerekiyorsa `error_events`, ve `mastery` satırları yazılıyor. _(16.11.2026: önizleme + `bibo-dev`, gerçek oturum: 10/10 cevap, 4 yanlış cevapta 6 hata olayı (`llm` ve `rule`), 8 ustalık satırı)_
- [ ] Yerel değerlendirme ≤ 1 sn; yapay zekâ değerlendirmesi p90 ≤ 6 sn. (Boşluk hakemliğine giden `gap_fill` cevapları yapay zekâ hedefine sayılır, SPEC rev. 4.)
- [x] Oturum bittikten sonra 60 sn içinde sonraki oturum `ready`; "Başla" ≤ 2 sn'de açılıyor. _(16.11.2026: önizlemede iki ölçüm, 57 sn (şemanın ilk derlenmesi) ve 21 sn; "Başla" elle denendi, ilk etkinlik hemen geliyor)_
- [x] Sayfa yenilenince oturum kaldığı etkinlikten devam ediyor. _(16.11.2026: önizlemede elle denendi; `session_resume` olayı 5. etkinlikte. Gönderilmemiş cevap metni yenilemede silinir)_
- [ ] Ağ sekmesinde hiçbir yanıtta cevap anahtarı görünmüyor.

---

## M7 — Dinleme

**Amaç:** Dinleme becerisini ölçen iki etkinlik, yüksek ses kalitesi ve kontrollü maliyetle.

**Kapsam**
- `lib/tts/speechify.ts`: `POST /v1/audio/speech`, `simba-3.5`, mp3, `en-US`; A1 için SSML `prosody rate="-10%"`; metnin XML kaçışı; base64 → `tts/` özel kovası; `sha256(model|voice|rate|text)` önbelleği; imzalı URL; `billable_characters_count` → `llm_usage.tts_chars`.
- Aylık karakter sayacı, `tts_monthly_char_alert` uyarısı; Speechify 402/429'da `tts_unavailable` yanıtı ve dinleme slotlarının metne düşmesi.
- `GET /api/items/:id/audio`; `ListenChoose`, `Dictation` bileşenleri; en çok 3 dinleme sayacı.
- Planlayıcıdaki geçici bayrağın dinleme için `tts_enabled` ayarına bağlanması.

**Bitti testi**
- [x] Aynı metin ikinci kez istendiğinde TTS çağrılmıyor (`llm_usage`'da tek `tts` satırı). _(17.11.2026: `tests/tts/tts.test.ts`, `tests/session/service.test.ts`; gerçek Speechify ile ilk dinlemede yeniden bakılacak)_
- [ ] A1 öğrencisinde hız 0,9 (`prosody -10%`), A2'de 1,0; `&` içeren bir metin hatasız seslendiriliyor. _(17.11.2026: A2 hızı 1,0 `bibo-prod`'da 3 gerçek seslendirmede doğrulandı. A1 ve `&` yalnızca testte (`tests/tts/tts.test.ts`); gerçek çağrı bekliyor)_
- [x] Dikte puanlaması M4 testleriyle tutarlı. _(17.11.2026: uç nokta üzerinden "She play football every day" → 0,80, yanlış)_
- [x] Speechify yanıtı sahte 402 ile değiştirildiğinde açık oturum kırılmıyor, sonraki oturum dinlemesiz planlanıyor. _(17.11.2026: `tests/session/service.test.ts` "M7 Bitti testi 4"; 24 saat sonra kendiliğinden yeniden denenir, PLAN karar 25)_
- [ ] iOS Safari ve Android Chrome'da ses çalıyor; 4. dinleme engelli.

---

## M8 — Konuşma

**Amaç:** Söz kesmeyen, aksanı cezalandırmayan, öğrenci hatalarını gizlemeyen konuşma etkinliği.

**Kapsam**
- `lib/audio/wav-recorder.ts` (Web Audio API, 16 kHz mono, istemcide örnek azaltma, 45 sn sınırı).
- `SpeakAnswer` bileşeni (bas-başlat / bas-bitir, transkripti göster, 1 yeniden kayıt).
- `lib/stt/mai.ts`: MAI-Transcribe-2, OpenRouter `/audio/transcriptions` üzerinden (`microsoft/mai-transcribe-2`, `language: "en"`, `verbatim` varsayılan). Doğrudan Azure Fast Transcription'a dönülürse yalnızca bu dosya değişir (SCOPE günlüğü 11.11.2026).
- `POST /api/items/:id/speech` (multipart, ≤ 2 MB), iki adım: transkript (MAI-Transcribe-2) → değerlendirme (Claude).
- MAI-Transcribe-2'nin dosya boyutu/süre sınırlarının doğrulanması. (OpenRouter üzerinden işleme AB dışında; `northeurope` yalnızca doğrudan Azure'a dönülürse geçerli.)
- `scripts/eval-verbatim.ts`.
- Planlayıcıdaki geçici bayrağın konuşma için kaldırılması.

**Bitti testi**
- [ ] `eval-verbatim`: pedagoji sahibinin bilerek hatalı okuduğu 20 kayıtta hataların ≥ %85'i transkriptte korunuyor. Değilse `SPEC.md` 5.1'deki yedek sağlayıcı denenir.
- [ ] Aksanlı ama dilbilgisi doğru 10 cevapta aksan nedeniyle puan düşülmüyor.
- [ ] iOS Safari ve Android Chrome'da mikrofon izni ve kayıt çalışıyor; sessizlikte kayıt durmuyor; iOS'ta gönderilen WAV 16 kHz.
- [x] Ses dosyası Storage'a veya diske yazılmıyor (kod incelemesi + kova kontrolü). _(17.11.2026: konuşma yolunda yazma çağrısı yok; `tts` kovası yalnızca `audio/mpeg`; `bibo-dev` `storage.objects` boş)_
- [ ] Transkript + değerlendirme toplamı p90 ≤ 6 sn.

---

## M9 — Başlangıç akışı ve ilerleme

**Amaç:** Davetten ilk oturuma 10 dakikadan kısa, ilk gün değer gösteren bir başlangıç.

**Kapsam**
- `/baslangic/profil` (seviye beyanı, ilgi alanları).
- `POST /api/placement` (sabit banka, `kind = placement`), ustalık tohumlama, `level_est`.
- "Tahmini zayıf noktalar" kartı, ardından ilk günlük oturumun üretimi.
- `/ilerleme` (ızgara, haftalık sayı, en sık 3 hata) · `POST /api/school-topic` ve haftalık soru · `app/manifest.ts` (PWA).
- **Tasarım geçişi** (yeni özellik değil; M6–M9 ekranlarının cilası):
  - Tek tema: shadcn değişkenleriyle renk, köşe yuvarlaklığı ve boşluk ölçüsü; tek yazı tipi (`next/font`, Türkçe karakter desteğiyle).
  - Ortak durumlar: yükleniyor (iskelet), boş, hata, `limit_hit` ve `tts_unavailable` mesajları; hepsi Türkçe ve "sen" dilinde.
  - Dokunma hedefleri ≥ 44 px; birincil düğme başparmak bölgesinde (ekranın alt kısmı).
  - İlerleme ızgarasının dört seviyesi yalnızca renkle değil, simge ya da desenle de ayırt edilir (renk körlüğü).
  - Arayüz metinlerinin pedagoji sahibiyle tek seferlik gözden geçirilmesi.
  - İsteğe bağlı (Bitti testini engellemez): karanlık mod ve marka kimliği (logo, illüstrasyon). Taş sonunda hazırsa v1'e girer, değilse v2'ye kalır.

**Bitti testi**
- [ ] Ekip dışından 3 kişi davet linkinden ilk etkinliğe 10 dakikadan kısa sürede ulaşıyor.
- [x] Yerleştirmede yapay zekâ çağrısı yalnızca konuşma sorusunda yapılıyor (`llm_usage`). _(17.11.2026: `tests/session/placement.test.ts`; `purpose = placement`)_
- [x] Izgara dört renk seviyesini doğru gösteriyor. _(17.11.2026: `tests/progress/progress.test.ts`)_
- [ ] Tüm öğrenci ekranlarında metin/arka plan kontrastı WCAG AA (≥ 4,5:1); Lighthouse erişilebilirlik puanı ≥ 90.
- [x] Izgara gri tonlamada da dört seviyeyi ayırt ettiriyor. _(17.11.2026: her seviyenin ayrı simgesi: · ✕ ◐ ✓)_
- [ ] Her ekranın yükleniyor, boş ve hata durumu var; pedagoji sahibi metinleri onayladı.
- [x] Seçilen okul konusu sonraki 2 oturumun planında yer alıyor. _(17.11.2026: planlayıcı testi, PLAN karar 35)_
- [ ] Uygulama iki platformda ana ekrana eklenebiliyor; 360 px'te yatay kaydırma yok.

---

## M10 — Yönetim, öğretmen kuyruğu ve pilot hazırlığı

**Amaç:** Pilotu ölçebilen, maliyeti durdurabilen, başlamaya hazır bir sistem.

**Kapsam**
- `/yonetim` özet: kayıtlı/aktif, haftada ≥ 4 oturum oranı, W4, ay içi maliyet (sağlayıcıya göre), oturum başı maliyet, ay içi TTS karakteri, önbellek isabet oranı.
- `/yonetim/inceleme`: kuyruk, karar kaydı, haftalık uyum.
- Ayarlar: acil durdurma, aylık tavan, günlük sınır, model kimlikleri ve `effort` seviyeleri, `tts_enabled`, `tts_plan_usd`.
- `GET /api/cron/daily` + `vercel.json`; `GET /api/account/export`.
- Son gizlilik metni (işleyen sağlayıcılar adıyla); sağlayıcı harcama limitlerinin son kontrolü (OpenRouter anahtar kredi limiti 40 $, Speechify planı; doğrudan sağlayıcıya dönülürse Anthropic Console ve Azure bütçe uyarısı); pilot kohortu ve davet kodu.
- Cihaz kontrol listesi; isteğe bağlı tek Playwright duman testi.

**Bitti testi**
- [ ] Acil durdurma açıkken yeni oturum üretilemiyor; öğrenci nazik mesaj görüyor. _(17.11.2026: sunucu tarafı testli (`tests/session/service.test.ts`: `ai_unavailable`, oturum satırı açılmıyor). Öğrenci mesajı elle kontrol bekliyor)_
- [x] Tavan test için 0,01 $'a düşürüldüğünde üretim duruyor ve panelde uyarı çıkıyor. _(17.11.2026: guard testleri + `tests/admin/metrics.test.ts`)_
- [x] `tts_monthly_char_alert` test için 1'e düşürüldüğünde panelde seslendirme kotası uyarısı çıkıyor. _(17.11.2026: `tests/admin/metrics.test.ts`)_
- [ ] Kuyruk, yapay zekâ etiketli hataların yaklaşık %15'ini içeriyor; sabit veriyle uyum yüzdesi doğru hesaplanıyor.
- [x] Cron, gizli anahtar olmadan `401` dönüyor. _(17.11.2026: `cronAuthorized` testi)_
- [ ] Dışa aktarım JSON'ı öğrencinin tüm tablolardaki kayıtlarını içeriyor.

### Pilot başlatma kapısı

- [ ] `SCOPE.md` "v1 bitti" tanımındaki tüm maddeler işaretli.
- [ ] İç test: ekip + en az 3 arkadaş, 3 gün, engelleyici hata yok.
- [ ] Hukuki görüş alındı; aydınlatma metni yayında.
- [ ] Başarı ölçütü eşikleri (`PRD.md` Bölüm 3) ve fiyat testi ücreti (`PRD.md` Açık soru 1) sabitlendi ve ikisinin de onayıyla yazıldı.
- [ ] Speechify planı kararı verildi: Gerçekçi kullanımda ay sonuna doğru ücretsiz kota bitiyor; ya Starter (10 $/ay) açılır ya da kota dolunca dinlemenin kapanması kabul edilir.

---

## M11 — Ölçme ve müfredat v2 (18 Kasım 2026)

**Amaç:** Sistem öğrenciyi net tanısın ve sınırlarını bilsin: A2 üstüne hizmet vermesin, bilinmeyeni "zayıf" saymasın, konuları gerekçeli bir sırayla seçsin. Gerekçe ve simülasyonlar: `docs/arastirma/olcme-ve-ogrenen-modeli.md`, `docs/arastirma/mufredat-onerisi.md`, `docs/arastirma/kaynak-sistem-rehberi.pdf`.

**Kapsam:** SPEC rev. 5 (3, 4.1–4.4, 4.7, 4.8, 5.1–5.3, 6, Ek C); PRD rev. 3 (F2, F4, F7–F10, F15, F16); göç `20261118120000_v2_measurement_curriculum.sql`.

**Bitti testi**
- [x] Motor testleri: yerleştirme (gerçek bankayla simülasyon: doğruluk > %82, ≤ 20 soru, yanlış dışlama ≤ %3), öğrenme profili, teşhis, müfredat, planlayıcı, kalibrasyon. _(18.11.2026: `npm test`)_
- [x] `scripts/simulate.ts`: ön koşul ihlali 0; tekdüze başarılı öğrencide yanlış teşhis ≈ 0; konuşma eksiği öğrencilerin ≥ yarısında en geç 8. oturumda.
- [x] Göç yerel Postgres'te uygulanıyor; `tests/db/v2-measurement.sql` ve `tests/db/rls.sql` geçiyor.
- [x] Servis testleri: uyarlamalı test uçtan uca (A1 öğrenci, A2 üstü öğrenci, ses yokken atlama), kapsam sayfası, yeniden test, "Bugün ne çalışalım?", okul programı haritası, 3 örnekli değerlendirme.
- [ ] Telefonda elle: uyarlamalı test (soru soru, geri bildirimsiz), A2 üstü sonuçta "çok yakında" sayfası, profil sorularının görünümü, ana sayfadaki seçenekler.
- [ ] Pedagoji onayları: P10–P13.
- [ ] `eval-generation` güncel kodla (kelime kapsamı denetimiyle) yeniden çalıştırıldı; düşen slot oranı ölçüldü.

---

## Pedagoji izi (paralel)

| # | Görev | Çıktı | Gerektiği taş |
| --- | --- | --- | --- |
| P1 | Konu listesini doğrula (`SPEC.md` Ek A) | Onaylı `topics.csv` | M3 |
| P2 | Hata kodlarını doğrula, her koda 2 yanlış/doğru örnek ekle (Ek B) | Onaylı `l1_codes.csv` | M3 |
| P3 | Açıklama stil rehberi (1 sayfa) | Komutlara girecek kurallar | M5 |
| P4 | Altın etiket seti: gerçekçi 40 öğrenci cümlesi + doğru kod | `golden.json` | M5 |
| P5 | 14 yerleştirme sorusu | `placement.json` | M3 / M9 |
| P6 | Bilerek hatalı okunmuş 20 ses kaydı + hata listesi | `verbatim/*.wav` | M8 |
| P7 | ChatGPT ile çalışan 10–15 hazırlık öğrencisiyle görüşme | Kısa rapor; eşik: ≥ 6 kişi aynı tıkanmayı anlatıyor | M5'e kadar |
| P8 | Aydınlatma ve açık rıza metni; hukuki görüş | Taslak (M2), son hâli (M10) | M2, M10 |
| P10 | Yerleştirme bankasını (134 madde; B1/B2 taslakları dil modelinden) gözden geçir ve onayla | `placement_bank.json` `status: approved` | M11 |
| P11 | Konu müfredat alanları ve ön koşullar; varsayılan yolun sırası | Onaylı `topics.csv` (`unit`, `value`, `exam_weight`, `confusables`, `goal_tags`) | M11 |
| P12 | Kelime listesi: taslağı NGSL / CEFR-J ile değiştir ya da doğrula | `lib/content/wordlist.ts` | M11 |
| P13 | Pilot tek üniversiteyse okul programı haritası | `programs`, `program_weeks` satırları | M11 |
| P9 | Seslendirme sesi seçimi: Speechify Simba 3.5 en-US seslerinden 2–3 aday, A1 hızında da dinlenir | `tts_voice` değeri | M7 |

P7 sonucu ürünle çelişirse (ör. öğrenciler asıl sorunun başka bir yerde olduğunu söylüyorsa) M6'dan önce kapsam yeniden konuşulur ve `SCOPE.md` günlüğüne yazılır.

---

## Takvim (tahmini)

Bir kilometre taşı = bir odaklı çalışma oturumu (≈ 3–5 saat). Haftada 3–4 oturumla:

| Dönem | Tarih (tahmini) | Ne |
| --- | --- | --- |
| İnşa | 16 Kasım – 6 Aralık 2026 | M1–M10; pedagoji izi paralel |
| İç test | 7 – 13 Aralık 2026 | Ekip + 3 arkadaş, hata düzeltme |
| Pilot | 14 Aralık 2026 – 7 Şubat 2027 (8 hafta) | 50 kişi; haftalık ölçüm; 4. haftada ara değerlendirme |
| Fiyat testi ve rapor | Pilotun son haftası | Ön ödeme isteği; karar: v2 Öncelik 1 |

**Takvim riski:** Pilot dönem sonu sınavlarına ve sömestr tatiline denk geliyor. Sınav dönemi kullanımı artırabilir, tatil düşürebilir. İki seçenek: ölçümleri "tatil öncesi" ve "tatil" diye ayrı raporlamak ya da pilotu bahar dönemi başına kaydırmak. Pilot başlamadan önce karar verin.

---

## Her oturum için çalışma kalıbı (Claude Code)

Repo kökündeki `CLAUDE.md` her oturumda otomatik yüklenir; tek tek taşlar için hazır komut vardır:

```text
/kilometre-tasi M3
```

Komut (`.claude/skills/kilometre-tasi/SKILL.md`) sırasıyla şunları yaptırır: ROADMAP'teki taşı ve ilgili SPEC/PRD bölümlerini okur → önceki testlerin yeşil olduğunu kontrol eder → plan çıkarır ve SPEC'le çelişen her noktayı size sorar → onaydan sonra `m<n>-…` dalında uygular → "Bitti testi" maddelerini tek tek çalıştırıp kanıtıyla raporlar.

Komut kullanılamıyorsa aynı işi şu istem yapar:

```text
docs/ROADMAP.md'deki M<numara> kapsamını uygula; docs/SCOPE.md dışına çıkma.
docs/SPEC.md'deki tablo, alan ve uç nokta adlarını aynen kullan.
Önce plan çıkar ve onayımı bekle. Bir karar SPEC.md ile çelişiyorsa uygulamadan önce bana sor.
Bitirince M<numara> "Bitti testi" maddelerini tek tek çalıştır ve sonucu kanıtıyla raporla.
```

Taş bitince: testler yeşil → yeni bir oturumda diff'i SPEC'e göre bağımsız incelet → `ROADMAP.md`'de kutular işaretli → `SCOPE.md`'de ilgili M maddeleri işaretli → ana dala birleştir.
