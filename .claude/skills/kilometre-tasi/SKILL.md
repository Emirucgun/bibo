---
name: kilometre-tasi
description: docs/ROADMAP.md'deki bir kilometre taşını (M1–M10) planlar, uygular ve "Bitti testi"ni kanıtıyla çalıştırır.
argument-hint: M<numara>
disable-model-invocation: true
---

Kilometre taşı: $ARGUMENTS

1. **Oku.** `docs/ROADMAP.md`'de $ARGUMENTS bölümünü, bağlı olduğu taşları ve "Bitti testi"ni oku. Kapsamda adı geçen `docs/SPEC.md` bölümlerini ve ilgili `docs/PRD.md` kabul kriterlerini oku. `docs/SCOPE.md`'de bu taşa ait M maddelerini bul.
2. **Başlangıç durumu.** `npm test` ve `npx tsc --noEmit` çalıştır. Önceki taşlardan kırmızı test varsa önce bunu raporla ve devam etmeden önce sor.
3. **Planla ve sor.** Dosya listesi, göçler, uç noktalar, bileşenler ve yazılacak testlerle kısa bir plan çıkar; SPEC'teki adları kullan. SPEC'te olmayan, SPEC ile çelişen ya da insan işi gerektiren (hesap açma, anahtar, telefon testi) her noktayı "Sorular" başlığı altında listele. Planı onaylamamı bekle.
4. **Uygula.** `m<n>-<kısa-ad>` dalı aç. Küçük, açıklamalı commitlerle ilerle. SCOPE dışına çıkma; aklına gelen ek fikirleri en sonda "v2 önerileri" olarak yaz.
5. **Doğrula.** Bitti testindeki her maddeyi tek tek çalıştır ya da doğrula. Gerçek API çağıran `eval-*` betiklerini çalıştırmadan önce tahmini maliyeti söyle ve onay iste.
6. **Raporla.**
   - Her Bitti testi maddesi: ✅ / ❌ + kanıt (komut ve çıktısının ilgili kısmı).
   - Elle kontrol listesi (telefon, tarayıcı, sağlayıcı paneli).
   - Değiştirilen dosyalar; harcanan API maliyeti (varsa, `llm_usage`'dan).
   - Açık kalanlar ve sorular.
   Yalnızca ✅ olan maddelerin kutularını `docs/ROADMAP.md` ve `docs/SCOPE.md`'de işaretle.
