# M5 Görev 1 sonucu: 20 etkinlik incelemesi

- **Tarih:** 13.11.2026.
- **İnceleyen:** Pedagoji sahibi.
- **Örneklem:** 11.11.2026 tarihli `eval-generation` çalıştırmasından üretilen `scripts/out/review-sample.md`. Örneklem 20 oturumdan rastgele seçildi, tohum sabit.

## Sonuç

İncelenen 20 etkinliğin 20'si de uygun bulundu. Eşik 18 olduğu için ROADMAP M5 maddesi geçti. Dört etkinliğe not düşüldü, ancak bunların hiçbiri etkinliği uygunsuz yapmıyor. Pedagoji sahibinin sözleriyle: "düzeltmesek de sorun olmaz ama örnek iyi olur, öğrenci bocalamaz".

| # | Etkinlik | Not | Ne yapılacak |
| --- | --- | --- | --- |
| 2 | translate_tr_en · g.do_does_q_neg · A1 | Açıklama sadeleştirilebilir. | P3 stil rehberine girdi olur. |
| 9 | listen_choose · p.th · A2 | Cümle biraz kafa karıştırabilir, yine de kullanılabilir. | Yok. |
| 12 | speak_answer · g.be_present · A1 | Etkinlik A1 başlangıç sorusuysa yönergeye bir örnek cevap eklenebilir. | Öneri aşağıda. |
| 16 | speak_answer · g.be_present · A1 | 12 ile aynı durum. | Öneri aşağıda. Ayrıca aşağıdaki kod düzeltmesine bakın. |

Genel değerlendirme:

- Sorular hem ilgi çekici hem de geleneksel kalıpların dışında.
- Etkinlikler sade, anlaşılır ve kafa karıştırmıyor; dört beceriyi birlikte çalıştırıyor.
- Zorluk, öğrencinin rahatça yapabildiğinin bir tık üstünde. Bu, iskele (scaffolding) yaklaşımında hedeflenen ideal düzeyle örtüşüyor.

## Mühendislik bulgusu: 16 numaralı etkinlik

16 numaralı etkinlikte `explanation_short_tr`, `explanation_long_tr` ve `hint_tr` alanlarının üçü de boş geldi. Etkinlik buna rağmen hem şemadan hem de kod kontrollerinden geçti. Bu, öğrenci hata yaptığında hiçbir açıklama görmeyeceği anlamına geliyordu.

Düzeltme `lib/ai/checks.ts` dosyasında yapıldı. Yönerge, kısa açıklama, uzun açıklama ve ipucu alanlarından biri boşsa ya da yalnızca boşluk içeriyorsa etkinlik reddediliyor. Reddedilen slot mevcut yeniden üretim turunda yeniden üretiliyor. İlgili test `tests/ai/checks.test.ts` dosyasında.

## Açık öneri (karar bekliyor)

A1 düzeyindeki `speak_answer` ve `short_write` etkinliklerinde, yönergeye bir örnek cevap kalıbı eklenebilir. Örnek: "Örnek: I am happy." Bu bir komut değişikliği olur.

Uygulanırsa:

- İstem önbelleği bir kez yeniden yazılır.
- `eval-generation` ile tekrar ölçmek gerekir; maliyeti yaklaşık 0,10 $.

Pedagoji sahibi bu değişikliği zorunlu görmüyor. Önerilen yol, değişikliği P3 stil rehberiyle birlikte tek seferde yapmak.
