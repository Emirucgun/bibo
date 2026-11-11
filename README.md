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
psql "<dev-db-url>" -v ON_ERROR_STOP=1 -f tests/db/rls.sql   # RLS ve seed doğrulaması (geri alınır)
```

İçerik (konular, hata kodları, yerleştirme soruları) `supabase/seed/` altındadır ve pedagoji sahibi tarafından düzenlenir. CSV değişince `npx tsx scripts/build-seed.ts` ile `supabase/seed.sql` yeniden üretilir; `npm test` ikisinin eşit olduğunu denetler. Seed upsert'tür, tekrar çalıştırılabilir. Türler: `tests/db/README.md`.

`prod`'a yalnızca `dev`'de doğrulandıktan ve ana dala birleştirildikten sonra, aynı komutlarla `<prod-ref>`'e bağlanarak uygulanır; ardından bağlantı `dev`'e geri alınır.

## Sağlık kontrolü

`GET /api/health` → veritabanına ulaşılıyorsa `200 { "db": "ok" }`, değilse `503 { "db": "error" }`.
