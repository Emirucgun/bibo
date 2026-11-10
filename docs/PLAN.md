# PLAN — Proje iskeleti ve M1 (İskelet, hesaplar ve canlı ortam)

| | |
| --- | --- |
| Tarih | 10 Kasım 2026 |
| Kapsam | Proje iskeleti + `ROADMAP.md` M1. M2 ve sonrası bu planda yok. |
| Durum | Onay bekliyor. Kod yazılmadı. |
| Kaynak belgeler | `SPEC.md` Bölüm 1, 2, 3, 9, 13 · `ROADMAP.md` M1 · `CLAUDE.md` |

M1'in sonunda elde olacak şey: boş ama canlı bir uygulama, `dev` ve `prod` veritabanına bağlı sağlık kontrolü, çalışan dağıtım hattı ve üç sağlayıcı anahtarının doğrulanması. Öğrenciye görünen hiçbir özellik bu taşta yok.

---

## 1. Verilen kararlar (10 Kasım 2026, soru–cevap turu)

| # | Konu | Karar |
| --- | --- | --- |
| 1 | Belgelerin yeri | `docs/`, `CLAUDE.md`, `.claude/` (`worktrees` hariç) bu dala kopyalandı; commit onay bekliyor. |
| 2 | Hedef ölçek | v1 = belgelerdeki 50 kişilik pilot (kapasite 60, tavan 40 $). 1.000 kullanıcı için şimdi hiçbir şey tasarlanmıyor. |
| 3 | Ad | Paket ve proje adları `bibo`. Arayüzdeki ürün adı tek sabitten gelir (`APP_NAME = "Kaynak"`). |
| 4 | Yerel veritabanı | Docker kurulu değil; yerel Supabase yığını yok. Göçler `dev` bulut projesine `supabase db push` ile gider. |
| 5 | Proje açılışı | Supabase `dev`/`prod` ve Vercel projesini insan açar; göçleri Claude Code uygular. |
| 6 | Sağlayıcı hesapları | Hazır değilse M1'in kod kısmı ilerler; "üç merhaba çağrısı" maddesi anahtarlar gelene kadar açık kalır. |
| 7 | Merhaba çağrıları | Tek seferlik `scripts/hello-providers.ts`, düz `fetch`. Guard'dan muaf (aşağıda not). M5'te silinir. |
| 8 | `app_settings` şekli | `key text PK, value jsonb not null, updated_at timestamptz`. `tts_voice` P9'a kadar `null`. |
| 9 | RLS zamanlaması | M1'de üç tabloda RLS açık, politika yok. Politikalar M2'de yeni göçle. |
| 10 | Sağlık kontrolü | Servis istemcisiyle `app_settings`'ten tek satır okuma. `DATABASE_URL` yok. |
| 11 | Sürümler | Ana sürümde SPEC kazanır; içindeki en güncel yama tam sürümle sabitlenir. |
| 12 | CI | GitHub Actions yok. Lint, tür ve test yerelde koşar. |

**Guard muafiyeti notu (karar 7):** `CLAUDE.md` "guard'ı atlayan yol yok" der. `llm_usage` tablosu M3'te, `guard.ts` M5'te geliyor; M1'deki betik bu yüzden guard'sız çalışır. Betik uygulama kodundan çağrılmaz, yalnızca elle koşulur ve M5'te silinir.

---

## 2. Belgelerde önerilen değişiklikler (onay gerekir)

`docs/` ve `CLAUDE.md` kendiliğinden değiştirilmedi. Karar 4 ve 8–10 şu düzeltmeleri gerektiriyor:

| Dosya | Şu an | Öneri |
| --- | --- | --- |
| `CLAUDE.md` Komutlar | `npx supabase db reset` (göç + seed) | `npx supabase db push` (bağlı `dev` projesine göç) |
| `CLAUDE.md` Komutlar | `gen types typescript --local` | `gen types typescript --linked` |
| `.claude/rules/veritabani.md` | aynı `--local` komutu | `--linked` |
| `SPEC.md` Bölüm 3 `app_settings` | sütun tanımı yok | `key`, `value jsonb`, `updated_at` |
| `ROADMAP.md` M1 | `GET /api/health` → `select 1` | `app_settings`'ten tek satır okuma |
| `SPEC.md` Bölüm 13 | göçleri kimin, nasıl uyguladığı yazmıyor | "`dev`'e her göçte, `prod`'a ana dala birleşince elle `db push`" |

---

## 3. Bağımlılıklar

Sürümler kurulum anında `npm view <paket> version` ile doğrulanır ve `package.json`'a `^` olmadan yazılır.

### Çalışma zamanı

| Paket | Hedef sürüm | Gerekçe |
| --- | --- | --- |
| `next` | 16.4.x | SPEC Bölüm 1. Arayüz + API tek repo, tek dağıtım. |
| `react`, `react-dom` | 19.x (Next ile gelen) | Next'in gereği. |
| `@supabase/supabase-js` | 2.110.x | Sağlık kontrolündeki servis istemcisi (`lib/db/admin.ts`). |
| `server-only` | son | `lib/db/admin.ts` yanlışlıkla istemci paketine girerse derleme kırılır; "sır istemcide yok" testinin güvencesi. |
| shadcn'in eklediği yardımcılar (`clsx`, `tailwind-merge`, `class-variance-authority`, simge paketi) | CLI'ın yazdığı | `shadcn init` çıktısı; bileşenler kaynak kod olarak kopyalanır. |

### Geliştirme

| Paket | Hedef sürüm | Gerekçe |
| --- | --- | --- |
| `typescript`, `@types/node`, `@types/react`, `@types/react-dom` | `create-next-app` varsayılanı | SPEC Bölüm 1. |
| `tailwindcss`, `@tailwindcss/postcss` | 4.3.x | SPEC Bölüm 1; yapılandırma dosyası gerektirmez. |
| `eslint`, `eslint-config-next` | `create-next-app` varsayılanı | `npm run lint`. |
| `vitest` | son | Birim test; M4'te teşhis motorunun test aracı. |
| `tsx` | son | `scripts/*.ts` çalıştırıcı. |
| `supabase` (CLI) | son | Göçler. Dev bağımlılığı olarak sabitlenir ki `npx supabase` herkeste aynı sürüm olsun. |

### M1'de bilerek kurulmayanlar

| Paket | Geleceği taş | Neden şimdi değil |
| --- | --- | --- |
| `@supabase/ssr` | M2 | Çerezli oturum ve `proxy.ts` M2 kapsamı. |
| `zod` | M2 | M1'de doğrulanacak girdi yok (`/api/health` gövdesiz). |
| `ai`, `@ai-sdk/anthropic` | M5 | Merhaba çağrısı düz `fetch` ile yapılır. |
| `@playwright/test` | M10 | İsteğe bağlı tek duman testi. |

---

## 4. Veri modeli (M1 göçü)

Tek göç dosyası: `supabase/migrations/<zaman>_init_cohorts_profiles_app_settings.sql`. Alan adları SPEC Bölüm 3 ile birebir aynı.

### `cohorts`

| Alan | Tür |
| --- | --- |
| `id` | `uuid primary key default gen_random_uuid()` |
| `name` | `text not null` |
| `invite_code` | `text not null unique` |
| `capacity` | `int not null default 60` |
| `starts_on`, `ends_on` | `date` |
| `created_at` | `timestamptz not null default now()` |

### `profiles`

| Alan | Tür / kısıt |
| --- | --- |
| `id` | `uuid primary key references auth.users(id) on delete cascade` |
| `display_name` | `text` |
| `role` | `text not null default 'student'`, `check in ('student','teacher','admin')` |
| `cohort_id` | `uuid references cohorts(id)` (davet girilene kadar `null`) |
| `level_self` | `text`, `check in ('A1','A2','unsure')` |
| `level_est` | `text`, `check in ('A1','A2')` |
| `interests` | `text[] not null default '{}'` |
| `explain_mode` | `text not null default 'short'`, `check in ('short','long')` |
| `adult_confirmed_at` | `timestamptz` |
| `consent_version`, `consent_at` | `text`, `timestamptz` |
| `onboarding_step` | `text not null default 'invite'`, `check in ('invite','consent','profile','placement','done')` |
| `created_at`, `updated_at` | `timestamptz not null default now()` |

Yeni kullanıcıda satır açan tetikleyici ve "en az 2 ilgi alanı" denetimi M2'de (sırasıyla tetikleyici ve `POST /api/onboarding/profile`).

### `app_settings`

| Alan | Tür |
| --- | --- |
| `key` | `text primary key` |
| `value` | `jsonb not null` |
| `updated_at` | `timestamptz not null default now()` |

Varsayılan 16 satır **göçün içinde** eklenir (seed'de değil), çünkü `prod` da bu değerlere ihtiyaç duyar ve `db push` seed çalıştırmaz:

| Anahtar | Değer |
| --- | --- |
| `kill_switch` | `false` |
| `monthly_budget_usd` | `40` |
| `daily_session_limit` | `2` |
| `model_generate`, `model_grade` | `"claude-haiku-5-5"` |
| `effort_generate` | `"medium"` |
| `effort_grade` | `"low"` |
| `thinking_grade` | `"adaptive"` |
| `model_transcribe` | `"MAI-Transcribe-2"` |
| `tts_model` | `"simba-3.5"` |
| `tts_voice` | `null` |
| `tts_enabled` | `true` |
| `tts_plan_usd` | `0` |
| `tts_monthly_char_alert` | `400000` |
| `review_sample_rate` | `0.15` |
| `general_content_rate` | `0.2` |

### RLS

Üç tabloda da `alter table … enable row level security;`, politika yok. Sonuç: `anon` ve `authenticated` rolleri hiçbir satırı göremez; yalnızca servis istemcisi erişir. Politikalar M2'de.

---

## 5. Oluşturulacak dosyalar

```
bibo/
├─ CLAUDE.md, .claude/, docs/         # kopyalandı (adım 0)
├─ package.json, package-lock.json    # ad: bibo; engines.node = 26.x
├─ tsconfig.json, next.config.ts, next-env.d.ts
├─ eslint.config.mjs, postcss.config.mjs
├─ components.json                    # shadcn
├─ vercel.json                        # { "regions": ["fra1"] }  (cron M10'da eklenir)
├─ vitest.config.ts
├─ .gitignore                         # .env*, !.env.example, .next, .vercel, supabase/.temp
├─ .env.example                       # SPEC Bölüm 9'daki 10 değişken, değersiz
├─ README.md                          # kurulum, komutlar, ortamlar (kısa)
├─ app/
│  ├─ layout.tsx                      # <html lang="tr">, başlık APP_NAME'den
│  ├─ globals.css                     # Tailwind 4 + shadcn belirteçleri
│  ├─ (app)/page.tsx                  # yer tutucu ana sayfa (Türkçe, tek cümle)
│  └─ api/health/route.ts             # GET → { db: "ok" } | 503 { db: "error" }
├─ components/ui/                     # shadcn; M1'de yalnızca init çıktısı
├─ lib/
│  ├─ utils.ts                        # shadcn `cn`
│  ├─ db/admin.ts                     # servis istemcisi, `import 'server-only'`
│  └─ content/app.ts                  # APP_NAME
├─ supabase/
│  ├─ config.toml                     # `supabase init`
│  ├─ migrations/<zaman>_init_cohorts_profiles_app_settings.sql
│  └─ seed.sql                        # boş yer tutucu (içerik M3'te)
├─ scripts/hello-providers.ts         # tek seferlik; M5'te silinir
└─ tests/env-example.test.ts          # örnek test
```

SPEC dizin yapısından iki sapma: `lib/content/app.ts` (ürün adı sabiti, karar 3) ve `scripts/hello-providers.ts` (karar 7). İkisi de SPEC ağacında yok.

M1'de **olmayanlar:** `proxy.ts`, `lib/db/server.ts`, giriş sayfaları (M2); `lib/db/types.ts` (M3).

---

## 6. Adımlar

Çalışma dalı: `m1-skeleton` (bu daldan açılır). Her adım ayrı, küçük bir commit.

### Adım 0 — Belgeleri yerleştir *(yapıldı, commit bekliyor)*

`docs/` (dört belge + bu plan), `CLAUDE.md`, `.claude/{rules,skills,settings.json}` dala kopyalandı.

Doğrulama: `git status --short` yalnızca bu yolları gösterir.

### Adım 1 — Next.js iskeleti

1. `npm view next@16 version` ile 16.4.x'in en güncel yamasını bul.
2. `create-next-app` dolu klasöre kurulmayı reddeder (`CLAUDE.md`, `.claude/`, `README.md` çakışır). Bu yüzden geçici bir klasöre kurulur, dosyalar repo köküne taşınır:
   `npx create-next-app@<sürüm> bibo --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm`
   (bayraklar kurulumdan önce `--help` ile doğrulanır).
3. `package.json`: ad `bibo`, tüm sürümlerden `^` kaldırılır, `"engines": { "node": "26.x" }`.
4. `app/page.tsx` → `app/(app)/page.tsx`; şablon içeriği silinir, Türkçe tek cümlelik yer tutucu. `layout.tsx`'te `lang="tr"`.
5. `lib/content/app.ts`: `export const APP_NAME = "Kaynak"`.
6. `.gitignore`'a `.env*` ve `!.env.example` eklenir.

Doğrulama:
- `npm run build` hatasız.
- `npm run lint` ve `npx tsc --noEmit` temiz.
- `npm run dev` → `http://localhost:3000` yer tutucu sayfayı gösterir.

### Adım 2 — shadcn

`npx shadcn@latest init` (varsayılan stil, nötr taban renk). M1'de bileşen eklenmez; ilk bileşen ihtiyaç duyan taşta gelir.

Doğrulama: `npm run build`, `npm run lint`, `npx tsc --noEmit`.

### Adım 3 — Vitest ve tsx

1. `npm i -D --save-exact vitest tsx`.
2. `vitest.config.ts`: `tests/**/*.test.ts`, `@/*` takma adı.
3. `package.json`: `"test": "vitest run"`.
4. `.env.example`: SPEC Bölüm 9'daki 10 değişken, değersiz.
5. `tests/env-example.test.ts`: `.env.example` tam olarak bu 10 anahtarı içerir, hiçbirinin değeri yoktur, `NEXT_PUBLIC_` önekli olanlar yalnızca Supabase URL'si ve yayınlanabilir anahtardır. (İşe yarayan bir örnek test: sır sızıntısına ve SPEC'ten sapmaya karşı kalıcı koruma.)

Doğrulama: `npm test` yeşil; `.env.example`'a sahte bir değer yazınca test kırmızı (sonra geri alınır).

### Adım 4 — Supabase CLI ve ilk göç

1. `npm i -D --save-exact supabase` → `npx supabase init`.
2. `npx supabase migration new init_cohorts_profiles_app_settings`; içerik Bölüm 4'teki gibi.
3. `supabase/seed.sql` boş yer tutucu.

Doğrulama (bu adımda yalnızca statik): göç dosyası SPEC Bölüm 3 ile alan alan karşılaştırılır; üç `enable row level security` satırı ve 16 `app_settings` satırı sayılır. Çalıştırma doğrulaması Adım 7'de.

### Adım 5 — Servis istemcisi ve sağlık kontrolü

1. `npm i --save-exact @supabase/supabase-js server-only`.
2. `lib/db/admin.ts`: `import 'server-only'`; `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY` ile istemci; oturum saklama kapalı.
3. `app/api/health/route.ts`: `export const dynamic = 'force-dynamic'`; `app_settings`'ten `key` seçip `limit(1)`. Başarılıysa `200 { "db": "ok" }`, değilse `503 { "db": "error" }`. Hata ayrıntısı yanıta yazılmaz, yalnızca sunucu günlüğüne.

Doğrulama: `npm run build`, `npm run lint`, `npx tsc --noEmit`, `npm test`. Canlı doğrulama Adım 7'de.

### Adım 6 — İnsan işleri (Claude Code yapamaz)

| # | İş | Not |
| --- | --- | --- |
| 6.1 | Supabase'te `bibo-dev` ve `bibo-prod` projeleri | Bölge Frankfurt. Ücretsiz planda iki aktif proje sınırı var. |
| 6.2 | Terminalde bir kez `npx supabase login` | Göçleri uygulayabilmem için. |
| 6.3 | Vercel'de proje: GitHub `bibo` deposunu içe aktar | Hobby. Bölge `vercel.json`'dan (`fra1`) gelir. |
| 6.4 | Vercel ortam değişkenleri | **Production** kapsamı → `prod` anahtarları; **Preview** kapsamı → `dev` anahtarları. SPEC Bölüm 9'daki 10 değişken. |
| 6.5 | Anthropic Console | Ön ödemeli kredi + aylık harcama limiti 40 $. |
| 6.6 | Azure for Students + Speech kaynağı | Bölge `northeurope`; 10 $ bütçe uyarısı. |
| 6.7 | Speechify API | Free plan. |
| 6.8 | Google Cloud OAuth istemcisi | M2'de kullanılır; şimdi açılması yeterli. |
| 6.9 | `.env.local` | `.env.example` kopyalanıp `dev` değerleriyle doldurulur. Repoya girmez; ben okumam. |

6.5–6.8 gecikirse Adım 7 yine yapılır; Adım 8 bekler.

### Adım 7 — Göçü uygula ve canlıya al

1. `npx supabase link --project-ref <dev-ref>` → `npx supabase db push`.
2. Yerelde `npm run dev` → `curl http://localhost:3000/api/health`.
3. PR aç → Vercel önizleme URL'si → `/api/health`.
4. Onayınla: `npx supabase link --project-ref <prod-ref>` → `npx supabase db push`; ana dala birleştir → prod URL → `/api/health`. Ardından bağlantıyı `dev`'e geri al.

Doğrulama:
- Üç ortamda da `{ "db": "ok" }`.
- `dev` ve `prod`'da Supabase panelinde üç tablo, RLS açık, `app_settings`'te 16 satır.
- Önizlemenin `dev`'e bağlı olduğu: Vercel panelinde Preview kapsamındaki `NEXT_PUBLIC_SUPABASE_URL` `dev` proje adresini gösteriyor (elle kontrol).
- Olumsuz test: yerelde `SUPABASE_SECRET_KEY` geçici olarak bozulunca `/api/health` `503 { "db": "error" }` döner (sen yaparsın; `.env.local`'a ben dokunmam).

### Adım 8 — Sağlayıcı merhaba çağrıları

`scripts/hello-providers.ts`, düz `fetch`, sırayla:

1. **Anthropic:** `POST /v1/messages`, model `claude-haiku-5-5`, kısa bir cümle, küçük `max_tokens`; `temperature` gönderilmez.
2. **Speechify:** `GET /v1/voices` listesinden ilk en-US ses → `POST /v1/audio/speech`, `simba-3.5`, tek cümle. Ses bellekte tutulur.
3. **Azure:** Speechify'ın ürettiği ses `transcriptions:transcribe`'a gönderilir (`MAI-Transcribe-2`, `locales: ["en"]`). Transkript, seslendirilen cümleyle karşılaştırılır.

Çıktı yalnızca durum, süre ve sayılardır (token, karakter, saniye); anahtar ya da yanıt gövdesi yazılmaz.

ROADMAP "Azure 3 sn'lik WAV" diyor; burada Speechify çıktısı (mp3) kullanılıyor. Azure mp3 kabul etmezse betik 3 saniyelik bir WAV dosyası yolunu argüman olarak alır.

Çalıştırma: `npx tsx --env-file=.env.local scripts/hello-providers.ts`. Gerçek API çağırır; tahmini maliyet 0,01 $'ın altında. Çalıştırmadan önce onay istenir.

Doğrulama: üç satırda da başarı; üç sağlayıcı panelinde kullanım görünür (elle kontrol). Bu adım aynı zamanda `northeurope`'ta MAI-Transcribe-2'nin Azure for Students aboneliğiyle açık olup olmadığını erkenden gösterir (M8 riski).

### Adım 9 — Sır denetimi, README, kapanış

1. `npm run build` sonrası istemci paketinde sır taraması:
   `grep -rEl "sb_secret_|sk-ant-|SUPABASE_SECRET_KEY|ANTHROPIC_API_KEY|AZURE_SPEECH_KEY|SPEECHIFY_API_KEY|CRON_SECRET" .next/static` → eşleşme yok.
2. `git check-ignore .env.local` → yol yazdırır (yok sayılıyor).
3. `README.md`: kurulum, komutlar, ortamlar, göç akışı (kısa).
4. Son tur: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`.

---

## 7. M1 "Bitti testi" eşlemesi

| ROADMAP maddesi | Hangi adım | Kanıt |
| --- | --- | --- |
| Prod URL açılıyor; `/api/health` → `{ "db": "ok" }` | 7 | `curl` çıktısı |
| PR'da önizleme URL'si oluşuyor ve `dev`'e bağlanıyor | 7 | önizleme `curl` çıktısı + Vercel ortam kapsamı (elle) |
| `npm test` yeşil | 3, 9 | komut çıktısı |
| Hiçbir sır istemci paketinde yok; `.env*` `.gitignore`'da | 9 | `grep` ve `git check-ignore` çıktısı, `tests/env-example.test.ts` |
| Üç sağlayıcıyla merhaba çağrısı çalışıyor, maliyet panellerde | 8 | betik çıktısı + paneller (elle) |

### Elle kontrol listesi

- [ ] Vercel: Preview kapsamı `dev`, Production kapsamı `prod` anahtarlarını taşıyor.
- [ ] Supabase `dev` ve `prod`: üç tablo, RLS açık, 16 ayar satırı.
- [ ] Anthropic, Azure, Speechify panellerinde merhaba çağrısının kullanımı görünüyor.
- [ ] Anthropic aylık limit 40 $, Azure bütçe uyarısı 10 $ tanımlı.
- [ ] Yerelde bozuk anahtarla `/api/health` `503` dönüyor.

---

## 8. Riskler

| Risk | Etki | Önlem |
| --- | --- | --- |
| `@latest` sürümleri SPEC tablosundan farklı ana sürümde | Belgedeki API adları tutmaz | Ana sürüm SPEC'e sabitlenir (karar 11); fark çıkarsa kurulumdan önce sorulur. |
| Yerel veritabanı yok; `dev` önizlemelerle paylaşılıyor | Bozuk bir göç önizlemeleri de kırar | Göçler küçük ve yalnızca eklemeli; `prod`'a ancak `dev`'de doğrulandıktan sonra. |
| `supabase link` yanlış projede kalır | `prod`'a istemeden göç | `prod`'a `db push` yalnızca açık onayla; sonrasında bağlantı `dev`'e geri alınır. |
| MAI-Transcribe-2 öğrenci aboneliğinde ya da `northeurope`'ta kapalı | M8 tıkanır | Adım 8 bunu M1'de ortaya çıkarır; yedek SPEC 5.1'de tanımlı. |
| Sağlayıcı hesapları gecikir | M1 kapanmaz | Adım 8 dışındaki her şey bağımsız ilerler. |

---

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
