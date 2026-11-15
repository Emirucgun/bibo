# bibo — Kaynak

Türkçe konuşan A1–A2 hazırlık öğrencileri için hatanın kaynağını (konu mu, beceri mi) bulan yapay zekâ İngilizce öğretmeni. v1: 50 kişilik, 2 aylık ücretsiz pilot.

Belgeler `docs/` altında: `PRD.md` (ürün), `SPEC.md` (teknik), `SCOPE.md` (kapsam), `ROADMAP.md` (kilometre taşları), `PLAN.md` (aktif taşın planı).

## Kurulum

Gereken: Node.js 26.x, npm.

```bash
npm install
cp .env.example .env.local   # değerleri doldur; repoya girmez
npm run dev                  # http://localhost:3000
```

## Komutlar

| İş | Komut |
| --- | --- |
| Geliştirme | `npm run dev` |
| Derleme | `npm run build` |
| Lint | `npm run lint` |
| Tür kontrolü | `npx tsc --noEmit` |
| Test | `npm test` |
| Seed + `lib/content/taxonomy.ts`'i CSV'lerden üret | `npx tsx scripts/build-seed.ts` |
| Sağlayıcı merhaba (gerçek API, < 0,01 $) | `npx tsx --env-file=.env.local scripts/hello-providers.ts` |
| Üretim değerlendirmesi (gerçek API, ≈ 0,10–0,25 $; önce onay) | `npx tsx --env-file=.env.local scripts/eval-generation.ts [--no-db]` |
| Altın seti CSV'den üret (`docs/pedagoji/altin-set.csv` → `scripts/data/golden.json`) | `npx tsx scripts/build-golden.ts [--check]` |
| Etiketleme değerlendirmesi (gerçek API, ≈ 0,03 $; altın set `scripts/data/golden.json`) | `npx tsx --env-file=.env.local scripts/eval-tagging.ts [--no-db]` |

## Ortamlar

| Ortam | Supabase | Vercel |
| --- | --- | --- |
| Yerel | `dev` projesi (`.env.local`) | `npm run dev` |
| Önizleme (her PR) | `dev` | Preview kapsamındaki ortam değişkenleri |
| Canlı (`main`) | `prod` | Production kapsamındaki ortam değişkenleri |

Bölgeler: Supabase Frankfurt, Vercel `fra1`.

## Veritabanı göçleri

Yerel Supabase yığını (Docker) kullanılmıyor; göçler bulut projelerine uygulanır.

```bash
npx supabase login                               # bir kez
npx supabase migration new <ad>                  # yeni göç (yalnızca eklenir)
npx supabase link --project-ref <dev-ref>
npx supabase db push --remote --include-seed     # dev'e uygula (CLI 3.x: --remote olmadan yerel yığını hedefler)
psql "<dev-db-url>" -v ON_ERROR_STOP=1 -f tests/db/rls.sql       # RLS ve seed doğrulaması (geri alınır)
psql "<dev-db-url>" -v ON_ERROR_STOP=1 -f tests/db/m2-auth.sql   # giriş, davet, onam, hesap silme (geri alınır)
```

İçerik (konular, hata kodları, yerleştirme soruları) `supabase/seed/` altındadır ve pedagoji sahibi tarafından düzenlenir. CSV değişince `npx tsx scripts/build-seed.ts` ile `supabase/seed.sql` yeniden üretilir; `npm test` ikisinin eşit olduğunu denetler. Seed upsert'tür, tekrar çalıştırılabilir. Türler: `tests/db/README.md`.

`prod`'a yalnızca `dev`'de doğrulandıktan ve ana dala birleştirildikten sonra, aynı komutlarla `<prod-ref>`'e bağlanarak uygulanır; ardından bağlantı `dev`'e geri alınır.

## Google ile giriş kurulumu (insan işi)

Kod hazır; aşağıdakiler panellerden bir kez yapılır (SPEC Bölüm 7).

1. **Google Cloud Console** → yeni proje (faturalandırma gerekmez) → *Google Auth Platform*: uygulama adı, destek e-postası, kullanıcı türü *External*; kapsamlar yalnızca `openid`, `email`, `profile`; yayın durumu *In production* (hassas kapsam olmadığı için doğrulama istenmez).
2. *Clients* → *Create client* → *Web application*. **Authorized redirect URIs:** `https://<dev-ref>.supabase.co/auth/v1/callback` ve `https://<prod-ref>.supabase.co/auth/v1/callback` (istenirse `dev` ve `prod` için ayrı istemci).
3. **Supabase** (`dev` ve `prod` ayrı ayrı) → *Authentication* → *Sign In / Providers* → **Google**: aç, Client ID ve Client Secret'ı gir. Aynı sayfada **Email** sağlayıcısını kapat (v1'de yalnızca Google).
4. **Supabase** → *Authentication* → *URL Configuration*:
   - `dev`: Site URL `http://localhost:3000`; Redirect URLs: `http://localhost:3000/auth/callback` ve `https://bibo-*-<vercel-ekip-slug>.vercel.app/auth/callback` (önizleme adresleri).
   - `prod`: Site URL = `APP_URL`; Redirect URLs: `<APP_URL>/auth/callback`.
5. Ortam değişkenleri: `CONSENT_VERSION` (Vercel Production + Preview'da tanımlı; `.env.local`'a da ekle), `APP_URL` (Production'da tanımlı; yerelde `http://localhost:3000`).

Davet linki `<adres>/davet/<invite_code>` biçimindedir; kodlar `cohorts.invite_code`'da durur (4–64 karakter: harf, rakam, `-`, `_`).

M9'a kadar profil ve yerleştirme adımları yer tutucudur. M6–M8 denemelerinde bir test hesabını `dev`'de başlangıcı bitmiş saymak için:

```sql
update public.profiles
   set onboarding_step = 'done', level_self = 'A1', level_est = 'A1',
       interests = '{football,music}', updated_at = now()
 where id = (select id from auth.users where email = '<e-posta>');
```

## Sağlık kontrolü

`GET /api/health` → veritabanına ulaşılıyorsa `200 { "db": "ok" }`, değilse `503 { "db": "error" }`.
