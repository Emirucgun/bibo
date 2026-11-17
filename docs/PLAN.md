# PLAN — M6 (Oturum akışı, metin etkinlikleri) — kapanış

| | |
| --- | --- |
| Tarih | 17 Kasım 2026 |
| Kapsam | `ROADMAP.md` M6 · `SPEC.md` Bölüm 3, 4.6, 5.2, 6 · `PRD.md` F3, F4, F7, F8 |
| Durum | Kod ana dalda (PR #13, `cbcb859`). Bitti testinde 4/6 madde işaretli (16.11.2026). Bu kapanış oturumunda: açık iki madde ölçüldü/incelendi, şık sırasından cevap sızıntısı bulunup düzeltildi. **M6 henüz kapanmadı**: aşağıdaki elle kontrol ve `eval-generation` yeniden çalıştırması bekleniyor. |
| Bağımlılık | M5 (`generateSession`, `gradeFree`, guard), M2 (`requireUser()` / `requireOnboarded()`) |

M1–M5 ve M2 planları bu dosyanın git geçmişinde (`80efea6`, `b4d6af6`, `5ff06bf`, `8b9c67f`, `0627de2`). M6 uygulama planı ayrı kaydedilmedi; ayrıntı `adfc966..cbcb859` commit mesajlarında.

---

## 1. Başlangıç durumu (17.11.2026, `cbcb859`)

- `npx tsc --noEmit` ✅ (temiz klonda önce `npx next typegen`: `RouteContext` / `LayoutProps` global türleri `.next/types`'ta üretilir)
- `npm test` ✅ 25 dosya, 765 test · `npm run lint` ✅

## 2. Bitti testi: açık maddeler

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

## 3. Elle kontrol

1. **Süre (bilgisayarda, önizleme, DevTools → Ağ):** bir oturumda `POST /api/items/<id>/attempt` isteklerinin "Time" sütunu. Yerel türler (`mcq_read`, `gap_fill`, `word_order`) ≤ 1 sn; serbest türler (`translate_tr_en`, `short_write`) en az 10 istekte p90 ≤ 6 sn.
2. **Anahtar (aynı oturumda):** `GET /api/sessions/<id>` ve `POST …/start` yanıtlarında `accepted`, `correct`, `distractors`, `model_answer_en`, `hint_tr` yok; `mcq_read` şıklarında doğru cevap her seferinde ilk sırada değil. `attempt` yanıtında yalnızca o etkinliğin sonucu var.
3. **iOS Safari:** bir oturum baştan sona (M10 cihaz listesinin ön denemesi).

## 4. Kapanış sırası

1. Elle kontrol 1–2 ve `eval-generation` → ROADMAP M6'daki iki kutu kanıtıyla işaretlenir.
2. SPEC'e göre bağımsız diff incelemesi (`98b82d4..HEAD`), ayrı oturumda.
3. SCOPE işaretleri (Bölüm 5'teki öneri onaylanınca).
4. Ana dala PR.

## 5. SCOPE önerisi (uygulanmadı, onay bekliyor)

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

## 6. Önceki taşlardan açık kalanlar

- **`prod`:** M2 ve M6 göçlerinin `bibo-prod`'a uygulanması (ana dala birleştikten sonra; durum doğrulanmadı).
- **SPEC önerileri (M2, onay bekliyor):** Bölüm 2 dizin yapısına `(auth)/davet/page.tsx`, `lib/auth/*`, `lib/api/*`, `lib/onboarding/*`; Bölüm 3'e `claim_invite`; Bölüm 6'ya M2 hata kodları.
- **Supabase e-posta kaydı** panelden kapatılmalı; **gizlilik metni** yer tutucuları M10'dan önce.
- **Karar #18 (M8):** transkript gösterimi + iki deneme; önerilen varsayılan: iki deneme de değerlendirilir, ustalığa sonuncusu işlenir.
- **Karar #22 (M9):** yerleştirme tohumlaması ve "3 zayıf konu"; önerilen varsayılan: normal kanıt gibi, en düşük ustalıklı üç konu.
- **Gecikme ölçümü:** Vercel Hobby logları 1 saat; uç nokta süreleri için kalıcı kaynak yok. v2 havuzu önerisi: `attempt` yanıtına `Server-Timing` başlığı ya da `events`'e süre (yalnızca sayı).
