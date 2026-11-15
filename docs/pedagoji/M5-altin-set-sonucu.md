# M5 Görev 2 sonucu: altın set ve etiketleme uyumu

- **Tarih:** 15.11.2026.
- **Altın set:** `docs/pedagoji/altin-set.csv` (pedagoji sahibi, P4). `npx tsx scripts/build-golden.ts` bunu doğrulayıp `scripts/data/golden.json`'a çevirir; `npm test` ikisinin eşit olduğunu denetler.
- **Ölçüm:** `scripts/eval-tagging.ts`, `bibo-dev`, ayarlar varsayılan (`model_grade = claude-haiku-5-5`, `effort_grade = low`, `thinking_grade = adaptive`).

## Altın setin uygunluğu

Set istenen 40 cümle yerine 94 cümle içeriyor. Biçim denetiminde hata ya da uyarı çıkmadı: bütün konu ve kod kimlikleri taksonomide, seviyeler konu seviyeleriyle aynı, `dogru_mu` ile kodlar tutarlı, tekrar eden cümle yok, kişisel veri yok.

| Ölçüt (M5-gorevler.md) | İstenen | Gelen |
| --- | --- | --- |
| Cümle sayısı | 40 | 94 |
| Doğru cevap | yaklaşık %20 | 20 (%21) |
| Farklı birincil kod | en az 12 | 22 |
| Bir koda en çok | 4 cümle | 3–4 cümle |
| Tür dağılımı | yarı yarıya | 46 çeviri, 48 kısa yazma |
| Seviye | karışık | 67 A1, 27 A2 |
| `GEN.*` örnekleri | birkaç | 15 (dört kodun hepsi) |

Birincil kod olarak kullanılmayan yalnızca `L1.TH_SOUND` ve `L1.W_V`. İkisi de telaffuz kodu olduğu için yazılı cevapta görünmez; bunlar M8'deki ses kayıtlarıyla (P6) ölçülür.

Bir sınırlama: cümlelerin bir kısmı, kod listesindeki örneklerin aynısı ya da çok yakını (ör. "I am agree", "I have seen him yesterday", "In my city has a big park"). Bu örnekler değerlendirme komutunda da yer alıyor. Bu yüzden ölçülen uyum, gerçek öğrenci cevaplarındaki uyumdan bir miktar yüksek olabilir. Pilot sırasındaki inceleme kuyruğu (M10) gerçek veriyle yeniden ölçecek.

## Sonuç

| Ölçüt | Hedef | Sonuç |
| --- | --- | --- |
| Öğretmen etiketiyle uyum | ≥ %80 | **%94,7** (89/94) |
| Hatalı cevaplarda birincil kod bulundu | | 70/74 |
| Doğru cevaplarda hata bulunmadı | | 19/20 |
| Değerlendirme süresi p90 | ≤ 6 sn | **3,4 sn** (p50 2,8 sn) |
| Maliyet | | 0,026 $ (94 çağrı, cevap başına ≈ 0,0003 $) |
| Önbellek isabeti (ilk çağrıdan sonra) | | %100 |

İki hedef de varsayılan ayarlarla tuttu; `effort_grade` ya da model değişikliği gerekmedi.

## Uyuşmayan 5 cümle (pedagoji sahibine)

| # | Öğrenci cevabı | Öğretmen | Model | Yorum |
| --- | --- | --- | --- | --- |
| g14 | My brother reading a book now. | `L1.BE_OMIT` | `GEN.OTHER` | Model hatayı buldu ama Türkçe kaynaklı saymadı. |
| g44 | What you did at the weekend? Where you went? | `L1.Q_INVERSION` | `L1.DO_SUPPORT` | İki kod da savunulabilir: soru sırası da bozuk, `did` de eksik. Etiket tartışmalı. |
| g71 | The beach was very funny. | `GEN.VOCAB` | hata yok | Model cümleyi doğru saydı; fun / funny ayrımını kaçırdı. |
| g74 | I go always to school by bus. | `GEN.OTHER` | `L1.WORD_ORDER_SOV` | Model zarfın yerini "fiili sona koyma" saydı; fiil sonda değil. |
| g94 | I love her very much. (Onu çok seviyorum.) | doğru | `L1.HIS_HER` | Model cevabı yanlış saydı; Türkçe "o" cinsiyetsiz olduğu için him de her de doğru. |

g71 ve g94 gerçek model hataları: biri kaçırılan hata, diğeri doğru cevaba konan yanlış hata. g94 türü hata öğrenciyi haksız yere düzelttiği için daha önemli; komutta "Türkçe 'o' için he / she / it ve him / her hepsi kabul edilir" kuralı eklenebilir. Bu bir komut değişikliği olduğundan P3 stil rehberiyle birlikte yapılması öneriliyor.

Ayrıntılı çıktı `scripts/out/eval-tagging.json` dosyasında (depoya girmez).
