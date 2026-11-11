---
paths:
  - "lib/ai/**"
  - "lib/stt/**"
  - "lib/tts/**"
  - "scripts/**"
  - "app/api/**"
---

# Yapay zekâ katmanı kuralları (ayrıntı: docs/SPEC.md Bölüm 5, 8, 10)

## Claude Haiku 5.5 (`claude-haiku-5-5`, OpenRouter üzerinden `lib/ai/client.ts`)

- `temperature`, `top_p`, `top_k` ve asistan ön doldurma (prefill) GÖNDERME: Haiku 5.5 bunlarda 400 hatası döner. İnternetteki AI SDK örneklerinin çoğu `temperature` içerir; kopyalarken çıkar.
- Düşünme derinliği OpenRouter isteğinde `reasoning.effort` ile: üretim `medium`, değerlendirme `low` (değerler `app_settings`'ten). Düşünmeyi kapatmak için `reasoning: { enabled: false }`.
- `max_tokens` düşünme tokenlarını da kapsar: üretim 16.000, değerlendirme 3.000. Düşük değer boş cevap üretir.
- Yanıt bir düşünme bloğuyla başlayabilir; içeriği konumla değil türle oku.
- `stop_reason: "refusal"` durumunu ele al (SPEC 5.1).
- Sistem komutu sabit tutulur ve sistem mesajında `cache_control: { type: 'ephemeral' }` ile işaretlenir; öğrenciye özgü kısım en sonda. Önbellek ancak istem ≥ 512 token ise çalışır.
- Kullanımdan `inputTokens`, `outputTokens` ve önbellek okuma/yazma sayılarını `llm_usage`'a yaz; maliyeti yalnızca `lib/ai/cost.ts` hesaplar.

## Yapılandırılmış çıktı (Zod şemaları)

- `z.record` kullanma (Anthropic katı JSON şeması serbest anahtarlı nesneyi desteklemez); dizi kullan (ör. `distractors: [{ option, code, feedback_tr }]`).
- `max`/`min` sınırları istekte açıklamaya dönüşür; cevaptan sonra Zod ile yine doğrula ve kod kontrollerini (SPEC 5.2) uygula.
- Şemayı değiştirmek istem önbelleğini bozar; gereksiz yere değiştirme.
- Katı şema dizi uzunluğunu zorlayamaz; sayının önemli olduğu yerde slot anahtarlı nesne kullan (`SessionGen`). 6+ slotlu `SessionGen` "Schema is too complex for compilation" verir: bir çağrıda en çok 5 slot (`MAX_SLOTS_PER_CALL`), parçalar paralel.
- `llm_usage.error`'a Zod sorunlarını yalnızca yol/kod/sınır olarak yaz (`formatIssues`); model metni asla.

## Transkript — Azure MAI-Transcribe-2 (`lib/stt`)

- `POST {AZURE_SPEECH_ENDPOINT}/speechtotext/transcriptions:transcribe?api-version=2025-10-15`, başlık `Ocp-Apim-Subscription-Key`.
- `multipart/form-data`: `audio` (WAV) + `definition` = `{"locales":["en"],"enhancedMode":{"enabled":true,"model":"MAI-Transcribe-2"}}`. JSON'da sondaki virgüle dikkat.
- `transcribeStyle` gönderme (varsayılan `verbatim`, öğrenci hatasını korur; `clean` kullanma).
- Ses diske/Storage'a yazılmaz; bellekte işlenip iletilir.
- Önizleme hizmeti: tüm çağrılar `lib/stt/index.ts` arayüzünden geçer ki sağlayıcı değişebilsin.

## Seslendirme — Speechify Simba 3.5 (`lib/tts`)

- `POST https://api.speechify.ai/v1/audio/speech`, `Authorization: Bearer`, gövde `{ input, voice_id, model: "simba-3.5", audio_format: "mp3", language: "en-US" }`.
- Yanıt base64 `audio_data`; çöz, `tts/` kovasına yaz, imzalı URL dön. `billable_characters_count` → `llm_usage.tts_chars`.
- A1 hızı: `<speak><prosody rate="-10%">…</prosody></speak>`. Metni SSML'e koymadan önce XML kaçışı yap (`&`, `<`, `>`). Yanlış yazılmış `rate` değeri hata vermez, sessizce yok sayılır.
- Önbellek anahtarı `sha256(model|voice|rate|text)`; aynı metin için ikinci kez çağırma.
- 402/429 → `tts_unavailable`; oturum kırılmaz, dinleme slotları metne düşer (SPEC 5.4).
- Speechify'a öğrenci kimliği ya da kişisel veri gönderme.
