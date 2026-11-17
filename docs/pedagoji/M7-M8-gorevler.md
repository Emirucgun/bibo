# M7–M8 pedagoji görevleri (P9 ses seçimi, P6 ses kayıtları)

Hazırlayan: mühendis · 17.11.2026 · Ayrıntı: `docs/PLAN.md` Bölüm 6

## P9 — Seslendirme sesi (dinleme etkinliklerini açar)

Ses seçilene kadar uygulama dinleme etkinliği üretmez; yerine okuma ve boşluk doldurma gelir.

1. Mühendis `scripts/tts-voices.ts` ile Speechify'daki Simba 3.5 en-US seslerini listeler ve 2–3 aday için örnek üretir.
2. Her aday için iki dosya gelir: `<ses>-A1.mp3` (yavaş, 0,9) ve `<ses>-A2.mp3` (normal). Örnek metin: -s eki, can/can't, th ve sayı içerir.
3. Ölçüt: A1 hızında da doğal mı; -s eki ve can/can't duyuluyor mu; uzun dinlemede yorucu mu.
4. Seçtiğin sesin kimliğini mühendise ilet; `app_settings.tts_voice`'a yazılır. Pilot boyunca değişmez.

## P6 — 20 bilerek hatalı + 10 aksanlı doğru kayıt (konuşma testi)

Amaç: konuşma tanıma öğrencinin hatasını "düzeltip" gizliyor mu (hedef: hataların ≥ %85'i korunur) ve aksan puanı düşürüyor mu (hedef: 0).

**Kayıt:** telefonun ses kaydedicisiyle, WAV biçiminde (uygulama WAV'ı kendisi 16 kHz'e çevirir). Her cümle ayrı dosya, 2–10 sn. Sessiz bir odada, telefon ağızdan ≈ 20 cm.

**20 hatalı okuma (`kind: "error"`):** A1–A2 öğrencilerinin gerçekçi hataları; her cümlede 1–2 hata. Örnekler: "She play football every day.", "My brother is teacher.", "I am agree.", "He don't like coffee.", "I go to school yesterday.". Her hata için iki ifade yaz: transkriptte geçmesi gereken yanlış biçim (`expect`, ör. "she play football") ve geçmemesi gereken düzeltilmiş biçim (`not`, ör. "she plays football").

**10 aksanlı doğru cevap (`kind: "accent"`):** belirgin Türkçe aksanla ama dilbilgisi doğru cevaplar; her biri bir soruya (`prompt_en`) cevap ve bir model cevap (`model_answer_en`) ile.

**Teslim:** dosyalar ve liste mühendise (repoya girmez, ses kişisel veridir). Liste biçimi: `scripts/data/verbatim/manifest.example.json`.
