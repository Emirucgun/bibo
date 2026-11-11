# Kaynak — proje yönergeleri

Türkçe konuşan A1–A2 hazırlık öğrencileri için hatanın kaynağını (konu mu, beceri mi) bulan yapay zekâ İngilizce öğretmeni. v1 = 50 kişilik, 2 aylık ücretsiz pilot; aylık altyapı bütçesi ≤ 50 €. Ekip iki kişi: mühendis + pedagoji sahibi.

## Belgeler (`docs/`)

- `docs/SPEC.md` — teknik tek doğruluk kaynağı. Tablo, alan, uç nokta, ayar ve dosya adları buradan **aynen** alınır.
- `docs/SCOPE.md` — v1'e ne girer. Burada olmayan yapılmaz; yeni fikri v2 havuzuna öner.
- `docs/ROADMAP.md` — kilometre taşları M1–M10 ve her birinin "Bitti testi".
- `docs/PRD.md` — kabul kriterleri (F1–F14) ve ürün ilkeleri.

Görev için yalnızca ilgili bölümleri oku; dört belgeyi her seferinde baştan okuma.

## Komutlar

- Geliştirme: `npm run dev` · derleme: `npm run build` · lint: `npm run lint` · tür: `npx tsc --noEmit`
- Test: `npm test` · tek dosya: `npx vitest run tests/engine/mastery.test.ts`
- Veritabanı: `npx supabase db reset` (göç + seed) · türler: `npx supabase gen types typescript --local > lib/db/types.ts`
- Betikler: `npx tsx scripts/<ad>.ts`. `eval-*` betikleri gerçek API çağırır ve para harcar: **çalıştırmadan önce tahmini maliyetle sor.**

## Mimari kurallar

- Next.js 16 App Router; middleware dosyasının adı `proxy.ts`. Oturum yenileme orada.
- `lib/engine/*` saf TypeScript: veritabanı, ağ ya da `Date.now()` yok (zaman parametre olarak gelir). Her davranış Vitest ile test edilir.
- Okumalar kullanıcının Supabase istemcisiyle (RLS). Yazmalar Route Handler'da `requireUser()` sonrası servis istemcisiyle (`lib/db/admin.ts`).
- IMPORTANT: `item_keys` (cevap anahtarı) hiçbir yanıtta istemciye gitmez. `select *` ile item döndürme; alanları açıkça seç.
- Her yapay zekâ, transkript ve TTS çağrısı: önce `lib/ai/guard.ts`, sonra çağrı, sonra `llm_usage` satırı. Guard'ı atlayan yol yok.
- `llm_usage`'a ve loglara öğrenci metni, transkript ya da komut içeriği yazılmaz; yalnızca sayılar.
- Model kimliği, `effort`, ses, bütçe gibi değerler `app_settings`'ten okunur; koda sabit yazılmaz.
- Arayüz metinleri Türkçe ve "sen" dilinde; kod, tablo ve değişken adları İngilizce.
- Göç dosyaları yalnızca eklenir; uygulanmış bir göç düzenlenmez. Her yeni tabloda RLS açık.

Yapay zekâ sağlayıcılarına özgü kurallar `.claude/rules/ai-katmani.md`'de, veritabanı kuralları `.claude/rules/veritabani.md`'de; ilgili dosyalara dokunulduğunda otomatik yüklenir.

## Çalışma düzeni

- Bir oturum = bir kilometre taşı: `/kilometre-tasi M<n>`. Plan onaylanmadan kod yazma.
- SPEC ile çelişen ya da SPEC'te olmayan bir karar gerekirse dur ve sor. `docs/` altındaki belgeleri kendiliğinden değiştirme; değişiklik öner.
- Bitti demeden önce `npm run lint`, `npx tsc --noEmit`, `npm test` ve taşın "Bitti testi" maddeleri. Sonucu kanıtıyla (komut çıktısı) göster.
- Her taş ayrı dal (`m3-schema` gibi), küçük ve açıklamalı commitler; ana dala PR ile.
- Telefonda elle denenmesi gerekenleri (iOS Safari mikrofon, ses çalma, OAuth ekranı) ayrı bir "elle kontrol" listesi olarak bildir.
- Sırlar yalnızca `.env.local` ve Vercel ortam değişkenlerinde. `.env*` dosyalarını okumaya çalışma; gerekirse `.env.example`'a bak.

## Sık yapılan hatalar

- `after()` ile yapılan iş aynı fonksiyon süresine dahil (Vercel Hobby üst sınır 300 sn); `finish` uç noktasında `export const maxDuration = 300`.
- Vercel istek gövdesi en çok 4,5 MB; ses yüklemesi 2 MB ile sınırlı.
- iOS Safari'de mikrofon ve ses çalma yalnızca kullanıcı dokunuşundan sonra başlar; `AudioContext` 16 kHz isteğini yok sayar, kaydedici kendisi örnek azaltır.
- Server Component'te çerez yazılmaz; Supabase oturum çerezleri `proxy.ts` ve Route Handler'larda güncellenir.

When compacting, always preserve: aktif kilometre taşı, değiştirilen dosyaların listesi, çalıştırılan test komutları ve açık sorular.
