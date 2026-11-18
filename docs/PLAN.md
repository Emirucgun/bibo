# PLAN — M11 (Ölçme ve müfredat v2)

| | |
| --- | --- |
| Tarih | 18 Kasım 2026 |
| Kapsam | `ROADMAP.md` M11 · `SPEC.md` rev. 5 (3, 4.1–4.4, 4.7, 4.8, 5.1–5.3, 6, Ek C) · `PRD.md` rev. 3 (F2, F4, F7–F10, F15, F16) · `SCOPE.md` rev. 3 |
| Dal | `claude/inspiring-bohr-jltvny` |
| Yetki | Kullanıcı: araştırma önerisi ve 13 karar "varsayılanlarla onay" (18.11.2026), ardından "Onay veriyorum, hepsini topluca uygula". Gerekçe ve simülasyonlar: `docs/arastirma/` |
| Durum | Kod tamam; `npm run lint` ✅ · `npx tsc --noEmit` ✅ · `npm test` ✅ 38 dosya, 1032 test · `npm run build` ✅ · SQL testleri ✅ (yerel Postgres 16). Göç `20261118120000` + seed dev ve prod'a uygulandı (18.11.2026). Önceki plan (M9 + M10) git geçmişinde |

## 1. Yapılanlar

| Alan | Dosyalar |
| --- | --- |
| Uyarlamalı yerleştirme (Bayesçi sınıflama, kapsam kapısı) | `lib/engine/irt.ts`, `lib/engine/placement-cat.ts`, `lib/session/placement.ts`, `supabase/seed/placement_bank.json` (134 taslak madde), `scripts/build-placement-bank.py` |
| Öğrenme profili (hiyerarşik Bayesçi, ADF) | `lib/engine/learner-model.ts`, `lib/session/learner.ts`; `lib/engine/mastery.ts` silindi, `mastery` tablosu türetilmiş önbellek |
| Teşhis (sonsal + gözlenen karşıtlık) | `lib/engine/diagnosis.ts` |
| Müfredat ve planlayıcı | `lib/engine/curriculum.ts`, `lib/engine/planner.ts`, `supabase/seed/topics.csv` (müfredat alanları taslak, 2 ölçme konusu) |
| Veritabanı | `supabase/migrations/20261118120000_v2_measurement_curriculum.sql`, `lib/db/types.ts`, `tests/db/v2-measurement.sql` |
| Servis ve API | `lib/session/{service,store,types}.ts`; yeni uç noktalar `/api/items/:id/skip`, `/api/scope`, `/api/waitlist`, `/api/placement/retest`, `/api/home`, `/api/focus-choice`; `requireInScope()` |
| Arayüz | `SessionRunner` (soru soru test), `PlacementSummary`, `ScopeNotice` + `/kapsam`, `HomeOptionsCard`, `SchoolTopicCard` önerileri, `ProfileForm` (mod, hedef, program), `SettingsForm`, `ProgressGrid` (tahmin hücreleri), `SessionSummary` (A2 tamamlandı) |
| Değerlendirme v2 | `lib/ai/grade.ts` (k örnek), `lib/ai/grade-vote.ts`, `lib/ai/prompts/grade.ts`, `GradeResult.confidence` |
| Üretim | kelime kapsamı (`lib/ai/checks.ts`, `lib/content/wordlist.ts` taslak), yeni slot amaçları komutta, ölçme konuları komutlarda yok |
| Kalibrasyon ve izleme | `lib/engine/calibration.ts`, `lib/cron/calibration.ts`, yönetim panelinde AUC / log-kayıp / ECE ve kapsam dağılımı |
| Belgeler | `SPEC.md` rev. 5, `PRD.md` rev. 3, `SCOPE.md` rev. 3, `ROADMAP.md` rev. 3 (M11, P10–P13) |

## 2. Kararlar

### Onaylı 13 karar (araştırma önerisi, varsayılanlar)

1. Konu listesini pedagoji sahibi ve danışman öğretmen doğrular (P11). 2. Kelime: şimdi içerik kapsamı denetimi, öğretim kolu pilot sonrası. 3. Pilot tek üniversiteyse okul programı haritası, değilse haftalık soru + 3 öneri. 4. "Kendi programım" modu ve hedef sorusu. 5. Ana sayfada 2–3 konu seçeneği. 6. th düşük öncelik; ünlü karşıtlıkları aday. 7. Oturumda girdi/çıktı/akıcılık kolları (okul modunda seyrek). 8. Yerleştirme ortalama 14–19, en çok 25 soru. 9. Kapı P ≥ 0,9, yanlış dışlama ≤ %2, 7 gün sonra bir yeniden test. 10. B1/B2 maddelerini dil modeli taslaklar, pedagoji sahibi onaylar. 11. 3 örnekli çoğunluk oyu (`grade_samples`). 12. Konuşma kapı için yalnızca destek kanıtı. 13. Bekleme listesi için tek KVKK cümlesi.

### Uygulama sırasında verilen kararlar

| # | Konu | Karar | Gerekçe |
| --- | --- | --- | --- |
| 40 | Profilin saklanması | `learner_state` önbellek; yoksa / uyumsuzsa `attempts`'ten yeniden kurulur. Konuşmanın 1. denemesi yeniden kurmada yalnızca oturumu bitmişse sayılır | Canlı yolla birebir aynı sonuç (testte doğrulandı); konu listesi değişse de veri kaybı yok |
| 41 | Izgara etiketi | Hücrede ≥ 2 doğrudan cevap varsa en az "gelişiyor" | 8/8 doğru cevabı olan hücrenin "henüz bilinmiyor" görünmesi yanıltıcıydı |
| 42 | Yerleştirmede geri bildirim ve ipucu | Gösterilmez; konuşma sorusunda yalnızca transkript ve "anlaşılmadı" mesajı | Ölçme etkisi; test öğretme değil |
| 43 | Kapıdaki öğrenciye konuşma | Sorulmaz | Kapı kararı konuşmaya bağlı değil (karar 12); gereksiz yapay zekâ çağrısı |
| 44 | Yeniden test | Toplam en çok 2 yerleştirme; `/kapsam`'dan | "Bir kez yeniden test" (karar 9) |
| 45 | Kapsam dışı öğrencinin erişimi | Ana sayfa `/kapsam`'a yönlenir; günlük uç noktalar `403 out_of_scope`; ayarlar ve ilerleme açık | Hesap silme ve veri indirme hakkı korunur |
| 46 | Odak seçimi | Bir kez geçerli: o odakla oturum bitince boşalır; seçim hazır oturumu bırakır | Öğrencinin seçimi bir sonraki oturumda görünsün |
| 47 | Mod / hedef değişimi | Hazır oturum bırakılır | Plan yeni tercihle yapılsın |
| 48 | Kelime kapsamı toleransı | Etkinlik başına 1 bilinmeyen sözcüğe göz yumulur; sesletim konuları muaf; ilgi alanı kelimeleri ve özel adlar bilinen | Kısa metinde oran tek sözcükle eşiğin altına düşüyor; taslak listeyle aşırı ret yeniden üretim maliyeti doğurur |
| 49 | Oy eşitliği | 2 geçerli örnek ayrışırsa cevap doğru sayılır | Kesinlik önceliği: haksız "yanlış" daha pahalı |
| 50 | Kalibrasyon | Gece işi yalnızca yerleştirme maddelerinin b'sini günceller (≥ 20 cevap); konu zorluğu ve tür ofsetleri pilot sonrası | 50 kişide güvenilir değil |
| 51 | `advanced_evidence` alanı | Eklenmedi | Karar 12 konuşmayı kapı için destek kanıtı yaptı; şimdilik tüketen bir kural yok, şema değişikliği istem önbelleğini bozar |
| 52 | İlerleme ekranında model ayarı | Saklanan durumun sürümü kabul edilir | `app_settings` yalnızca admin; öğrenci istemcisi okuyamaz |
| 53 | Teşhis entegrasyon testi | Geçmiş, yeni modelin eşiğini net geçecek kadar kanıtla kuruldu (yazma 10/10, konuşma 1/7) | v2 kesinlik öncelikli: 4 konuşma cevabı artık yetmiyor (PRD F8 ölçütü buna göre güncellendi) |

## 3. Bitti testi kanıtı

| Madde | Durum | Kanıt |
| --- | --- | --- |
| Lint, tür, birim testleri | ✅ | `npm run lint` uyarısız; `npx tsc --noEmit` çıkış 0; `npm test`: 38 dosya, 1032 test geçti |
| Derleme | ✅ | `npm run build` başarılı; yeni `/kapsam` sayfası ve uç noktalar listede |
| Yerleştirme simülasyonu (gerçek banka) | ✅ | `tests/content/placement.test.ts`: doğruluk > %82, ortalama ≤ 20 madde, yanlış dışlama ≤ %3 (araştırma ölçümü: %85, 18,3 madde, %0,9) |
| Uçtan uca simülasyon | ✅ | `npx tsx scripts/simulate.ts`: "skill_gap(speaking) ilk oturum: 3 → GEÇTİ (≤ 8) · ön koşul ihlali: 0" |
| Veritabanı | ✅ | Yerel Postgres 16, tüm göçler + seed: `rls.sql` 32, `m2-auth.sql` 40, `m6-session.sql` 17, `v2-measurement.sql` 15 kontrol geçti |
| Profil yeniden kurma = canlı güncelleme | ✅ | `tests/session/service.test.ts` "ipuçlu doğru cevap yarım ağırlıklı kanıttır…" |
| Uyarlamalı test, kapı, yeniden test, ses yokken atlama | ✅ | `tests/session/placement.test.ts`, `tests/session/scope.test.ts` |
| 3 örnekli değerlendirme | ✅ | `tests/ai/grade-vote.test.ts`, servis testi "grade_samples = 3…" |
| `eval-generation` (kelime kapsamıyla) | ⏳ | Onaylandı; ancak bu ortamda OpenRouter anahtarı yok. Betik artık kapsam eşiklerini geçiriyor ve kelime nedeniyle reddedilen / düşen slotları raporluyor; anahtarı olan bir makinede çalıştırılmalı |
| Göçün dev/prod'a uygulanması | ✅ | Supabase MCP ile `apply_migration` (dev `bibo-dev`, prod `bibo-prod`); `schema_migrations` sürümü dosya adıyla eşitlendi (`20261118120000`); `seed.sql` konu upsert'i. Dev'de `tests/db/v2-measurement.sql` (geri alınan işlemde) geçti, artık veri kalmadı. Prod'da salt okunur doğrulama: 34 konu (2 ölçme), 19 yeni sütun, 8 politika, 6 ayar, RLS'i kapalı tablo 0 |

## 4. Elle kontrol (telefon)

- [ ] Yerleştirme: sorular tek tek geliyor, doğru/yanlış gösterilmiyor, sayaç "n. soru"; ipucu düğmesi yok.
- [ ] Yerleştirmede dinleme: ses çalmazsa "Geç" sonraki soruya geçiyor ve test dinlemesiz sürüyor (iOS Safari'de ses çalma dokunuştan sonra).
- [ ] Yerleştirme sonu konuşma sorusu: mikrofon izni, kayıt, transkript; "Testi bitir".
- [ ] Test sonu kartları (iyi gidenler / zorlandıkların / netleştireceklerimiz) ve "sınırda" notu.
- [ ] Hep doğru cevapla A2 üstü sonuç: "çok yakında" sayfası, "Hazır olunca haber ver", yeniden test tarihi; ana sayfa bu sayfaya yönleniyor; ayarlar açılıyor.
- [ ] Profil adımı: çalışma modu, hedef, (program varsa) program seçimi; küçük ekranda taşma yok.
- [ ] Ana sayfa: "Bugün ne çalışalım?" seçimi sonrası yeni oturumun odağı seçilen konu; okul sorusunda öneri düğmeleri.
- [ ] İlerleme ızgarası: soluk "tahmin" hücreleri ve açıklama satırı.
- [ ] Ayarlar: mod ve hedef değişikliği kaydediliyor.

## 5. Açık konular

- Pedagoji onayları (ROADMAP P10–P13): yerleştirme bankası, konu müfredat alanları ve varsayılan yol, kelime listesi, okul programı haritası.
- Mevcut kullanıcıların profili ilk cevaplarında `attempts`'ten kendiliğinden kurulur. Eski yerleştirme oturumları `bank_item_id` taşımadığı için IRT parametresi yerine konu modeliyle işlenir.
- Mevcut (pilot öncesi deneme) kullanıcıların `scope_status`'u `in_scope`; isterlerse yerleştirmeyi yeniden yapmaları için adımlarını SQL ile `placement`'a almak gerekir.
- Maliyet: serbest cevap değerlendirmesi ×3; `eval-generation` ve pilotun ilk haftasında `llm_usage` ile izlenmeli.
