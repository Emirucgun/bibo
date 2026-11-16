# PLAN — M2 (Giriş, davet ve onam)

| | |
| --- | --- |
| Tarih | 15 Kasım 2026 |
| Kapsam | `ROADMAP.md` M2 · `SPEC.md` Bölüm 3 (`cohorts`, `profiles`, RLS), 6 ("Kimlik ve başlangıç", `DELETE /api/account`), 7, 9, 11 · `PRD.md` F1, F13, A1, A8 |
| Durum | Uygulandı. Göç `bibo-dev`'de; `npm test` (698), lint, tür ve derleme yeşil. Bitti testinin beş maddesi yerelde uçtan uca, `bibo-dev`'de SQL ile ve 16.11.2026'da önizlemede **gerçek Google girişiyle** doğrulandı; ROADMAP M2 ve SCOPE F1 kutuları işaretli. Google OAuth istemcisi kuruldu (`Testing` durumunda, test kullanıcılarıyla); `bibo-dev`'de Google açık. **Açık:** `prod` (göç + Supabase ayarları, ana dala birleştikten sonra), Google tarafında yayınlama (M10). |
| Bağımlılık | M1 (`cohorts`, `profiles`), M3 (`private.user_role()`, öğrenci tablolarındaki `on delete cascade`). M6 bu taşın `requireUser()` / `requireOnboarded()` yardımcılarını kullanır. |

M1, M3, M4 ve M5 planları bu dosyanın git geçmişinde (`80efea6`, `b4d6af6`, `5ff06bf`, `8b9c67f`).

---

## 1. Yaklaşım

- **Oturum:** `@supabase/ssr` 0.12.7, çerez tabanlı. `proxy.ts` her istekte `getClaims()` ile JWT'yi doğrular ve oturumu yeniler; girişsiz kullanıcıyı `/giris`'e yönlendirir. API yolları yönlendirilmez, Route Handler kendi `401` yanıtını döner.
- **Kapı:** SPEC Bölüm 7'deki gibi `(app)` düzeninde; `onboarding_step` → sayfa eşlemesi `lib/onboarding/steps.ts`'te. Başlangıç sayfaları kendi adımını denetler (`StepGate`). Kapı yalnızca yönlendirmedir: veri erişimi `requireUser()` / `requireOnboarded()` ve RLS ile korunur.
- **Cache Components:** oturum okuyan her bileşen bir `<Suspense>` içinde. `lib/db/server.ts` istemciyi oluşturmadan önce `connection()` bekler: oturum yalnızca istek anında okunur, kapı kararı çerezli ön-render'a (kısmi ön getirme) girmez.
- **Kararlar saf fonksiyonlarda:** davet, onam ve hesap silme `lib/onboarding/service.ts`'te, veritabanı `OnboardingStore` arayüzüyle enjekte edilir (M5'teki `AiStore` kalıbı). Route Handler yalnızca `requireUser()` → servis → yanıt.
- **Okuma / yazma:** profil kullanıcının kendi istemcisiyle (RLS) okunur; `claim_invite`, rıza kaydı ve silme `requireUser()` sonrası servis istemcisiyle.

## 2. Dosyalar

| Dosya | Ne |
| --- | --- |
| `supabase/migrations/20261115172508_m2_auth_profiles_cohorts.sql` | `private.handle_new_user()` + `auth.users` tetikleyicisi; `private.user_cohort_id()`; `profiles` ve `cohorts` politikaları; `public.claim_invite(uuid, text)` (yalnızca `service_role`); `profiles_cohort_id_idx` |
| `lib/db/server.ts`, `lib/db/env.ts` | Kullanıcı istemcisi (çerez, RLS); herkese açık Supabase ayarları |
| `proxy.ts` | Oturum yenileme, `/giris` yönlendirmesi, `/davet/[code]` kodunu `invite_code` çerezine yazma (httpOnly, 7 gün) |
| `lib/auth/paths.ts`, `lib/auth/origin.ts` | Saf: herkese açık yollar, yönlendirme kararı, davet kodu biçimi; OAuth dönüş adresi |
| `lib/auth/viewer.ts`, `lib/auth/require.ts` | `getViewer()`; `requireUser()`, `requireRole()`, `requireOnboarded()` |
| `lib/api/errors.ts`, `lib/api/respond.ts`, `lib/api/client.ts` | `{ error: { code, message_tr } }` biçimi, `withApi()`, tarayıcı tarafı `callApi()` |
| `lib/onboarding/{steps,schemas,service,store}.ts` | Adımlar, Zod girdileri, kararlar, Supabase uygulaması |
| `app/(auth)/giris`, `app/(auth)/davet`, `app/(auth)/davet/[code]`, `app/(auth)/actions.ts` | Giriş, davet kodu formu, Google ile giriş ve çıkış (Server Function) |
| `app/auth/callback/route.ts` | Kodu oturuma çevirir; davet çerezi varsa `/davet/<kod>`'a, yoksa ana sayfaya |
| `app/(onboarding)/baslangic/onam` | 18+ beyanı ve açık rıza formu |
| `app/(onboarding)/baslangic/{profil,yerlestirme}` | **Yer tutucu**; gerçek sayfalar M9'da |
| `app/(app)/layout.tsx` | Başlangıç kapısı |
| `app/gizlilik/page.tsx` | Aydınlatma metni **taslağı** (P8); veri sorumlusu ve iletişim yer tutucu |
| `app/api/onboarding/{invite,consent}/route.ts`, `app/api/account/route.ts` | SPEC Bölüm 6 uç noktaları |
| `components/auth/*`, `components/onboarding/*` | Ortak iskelet, Google düğmesi, formlar, `StepGate` |
| `tests/{auth,api,onboarding}/*.test.ts` | 98 birim testi |
| `tests/db/m2-auth.sql`, `tests/db/supabase-stub.sql` | 40 SQL doğrulaması; stub'a `raw_user_meta_data` eklendi |

## 3. Verilen kararlar

| # | Konu | Karar |
| --- | --- | --- |
| 1 | Kodsuz giriş (kullanıcı onayı, 15.11.2026) | `onboarding_step = 'invite'` olan kullanıcı `/davet`'e düşer: kod kutusu, linkten gelindiyse dolu. **SPEC önerisi:** dizin yapısına `(auth)/davet/page.tsx` eklenmeli. |
| 2 | M9'a kadar rıza sonrası (kullanıcı onayı, 15.11.2026) | Kapı tam çalışır; `/baslangic/profil` ve `/baslangic/yerlestirme` yer tutucu. M6–M8 denemelerinde test hesabı SQL ile `done` yapılır (README). Geçici istisna kodu yok. |
| 3 | Gizlilik taslağı (kullanıcı onayı, 15.11.2026) | "TASLAK" etiketiyle yayında; veri sorumlusu, iletişim ve transkriptin işlendiği bölge `[pilot öncesi eklenecek]`. Son metin M10 (hukuki görüş). |
| 4 | Davetin kullanılması | Callback kodu kendisi kullanmaz; `/davet/<kod>` sayfasına döner, kullanıcı "Devam et" ile `POST /api/onboarding/invite` çağırır (SPEC Bölüm 7, PRD A1 adım 2). Kapasite hatası böylece formda gösterilir. |
| 5 | Kapasite | `claim_invite` kohort satırını `for update` ile kilitler, kohorttaki **tüm** `profiles` satırlarını sayar (rol ayrımı yok). Zaten kohortta olan kullanıcı için `already_joined` → `{ ok: true }` (yer yeniden ayrılmaz). **SPEC önerisi:** fonksiyon Bölüm 3'e not edilmeli. |
| 6 | Durum kodları | Geçersiz kod `404 invalid_code`; kapasite `409 cohort_full`; davetsiz onam `403 invite_required`; sayfadaki sürüm `CONSENT_VERSION` değilse `409 consent_version_mismatch`; `CONSENT_VERSION` tanımsızsa `500` (rıza sürümsüz kaydedilmez); onay metni `"SİL"` değilse `400`. |
| 7 | Rızanın tekrarı | Rızası kayıtlı kullanıcı yeniden gönderirse `{ ok: true }`, ilk sürüm ve zaman korunur. Güncelleme `onboarding_step = 'consent'` koşuluyla yapılır. |
| 8 | OAuth dönüş adresi | Canlıda `APP_URL`; önizleme ve yerelde isteğin kendi adresi (Vercel Preview'da `APP_URL` yok, adresler değişken, PKCE çerezi girişin başladığı alan adında). Supabase izin listesi yine de son sözü söyler. |
| 9 | `CONSENT_VERSION` | `2026-11-pilot-v1`; Vercel Production ve Preview'a eklendi (15.11.2026). Metin değişince artırılır. |
| 10 | `getClaims()` | JWT her istekte doğrulanır; silinmiş hesap, profil satırı RLS ile okunamadığı için `401` alır. Token var, profil yoksa sayfalar "Hesabını bulamadık" + çıkış gösterir. |
| 11 | Çıkış | SPEC'te uç nokta yok; `signOut` Server Function olarak eklendi (davet, onam ve ana sayfa yer tutucusunda düğme). Ayarlar sayfası sonraki taşlarda. |
| 12 | Tetikleyici ve yardımcılar | `private` şemasında, `security definer`, `search_path = ''` (M3'teki `private.user_role()` kalıbı). `display_name` Google `full_name` / `name` alanından, 80 karakterle sınırlı. |
| 13 | Dal | Oturumun dalı `claude/m2-completion-plan-ll9u9u` (`m2-…` yerine). |

## 4. Bitti testi eşlemesi

Bu ortamdan Supabase adresine ağ erişimi ve servis anahtarı olmadığı için uçtan uca deneme yerelde yapıldı: gerçek uygulama derlemesi + gerçek Postgres (tüm göçler, tetikleyici, RLS, `claim_invite`) + Supabase Auth/REST yerine küçük bir yerel taklit sunucu (Google yerine sahte kimlik). Taklit sunucu repoda değil. Gerçek Supabase Auth ve Google ayağı elle kontrol listesinde.

| ROADMAP maddesi | Kanıt |
| --- | --- |
| Davet kodu olmadan giriş yapan kullanıcı onam sayfasına geçemiyor | Yerel uçtan uca: `/` ve `/baslangic/onam` → `/davet`; `POST /api/onboarding/consent` → `403 invite_required`; yanlış kod → `404`. `tests/onboarding/service.test.ts`. `bibo-dev` SQL: davetsiz kullanıcıda rıza güncellemesi 0 satır. |
| Kapasite 1'e düşürüldüğünde ikinci kullanıcı `409` alıyor | Yerel uçtan uca: A kabul, B `409 cohort_full` + "Bu grubun kontenjanı doldu" mesajı. `bibo-dev` SQL: `claim_invite` ikinci kullanıcıda `full`. |
| Rıza sürümü ve zamanı `profiles`'ta | Yerel uçtan uca: `consent_version = 2026-11-pilot-v1`, `consent_at` ve `adult_confirmed_at` dolu, adım `profile`. `bibo-dev` SQL: aynı güncelleme. |
| İki test kullanıcısıyla RLS: A, B'nin profilini okuyamıyor | **`bibo-dev` SQL (gerçek RLS):** A 1 satır görür, B'nin satırı 0; öğrenci `cohorts` göremez, rolünü ve adımını değiştiremez. Yerel uçtan uca: A'nın oturum tokenıyla REST sorgusu 0 satır. |
| Hesap silme sonrası `auth.users` ve `profiles` satırı yok | Yerel uçtan uca: `DELETE /api/account` → `{ ok: true }`, iki tabloda 0 satır, oturum kapanır, kohortta yer açılır. `bibo-dev` SQL: `auth.users` silinince `profiles` gider. |

Komutlar: `npm test` (698) · `psql -d <db> -f tests/db/m2-auth.sql` (40 doğrulama; yerelde ve `bibo-dev`'de geçti) · yerel uçtan uca 45/45.

## 5. Açık sorular ve elle kontrol

1. ~~Google OAuth kurulumu.~~ 16.11.2026'da yapıldı: Google Cloud istemcisi (`Testing`, test kullanıcılarıyla) ve `bibo-dev`'de Google sağlayıcısı. Yayınlama için Google "App domain" alanlarını (ana sayfa, gizlilik linki, kullanım koşulları linki) istiyor; son gizlilik metniyle birlikte M10'da.
2. ~~Elle kontrol (önizleme, gerçek Google hesabıyla).~~ 16.11.2026'da geçti: davet linki → giriş → kod dolu → onam; hesap silme; davetsiz giriş `/davet`'te kalıyor; dolu 1 kişilik kohortta kontenjan mesajı. Telefonda da Google ekranı ve dönüş sorunsuz (mühendisin bildirimi, 16.11.2026); iki platformun ayrı ayrı kontrolü M10 cihaz listesinde.
3. **`prod`:** göç ana dala birleştikten sonra uygulanır; pilot kohortu ve davet kodu M10'da.
4. **SPEC önerileri (uygulanmadı, onay bekliyor):** Bölüm 2 dizin yapısına `(auth)/davet/page.tsx`, `lib/auth/*`, `lib/api/*`, `lib/onboarding/*`; Bölüm 3'e `claim_invite`; Bölüm 6'ya M2 hata kodları.
5. **Gizlilik metni:** veri sorumlusu, iletişim adresi ve MAI-Transcribe-2'nin OpenRouter üzerinden işlendiği bölge M10'dan önce doldurulmalı (SCOPE günlüğü 11.11.2026).
6. **Supabase'de e-posta ile kayıt:** varsayılan olarak açık; SPEC yalnızca Google dediği için panelden kapatılmalı (README).

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
