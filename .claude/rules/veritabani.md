---
paths:
  - "supabase/**"
  - "lib/db/**"
---

# Veritabanı kuralları (ayrıntı: docs/SPEC.md Bölüm 3)

- Tablo ve alan adları SPEC Bölüm 3'tekiyle birebir aynı. Sabit kümeler (`skill`, `mode`, `activity_type`, `purpose`, `role`) hem kodda sabit hem veritabanında `check` kısıtı.
- Her yeni tabloda `alter table … enable row level security;` ve SPEC'teki RLS tablosuna uygun politikalar aynı göçte.
- `item_keys` için öğrenci ve öğretmene hiçbir `select` politikası yazma. `llm_usage`, `tts_cache`, `app_settings` yalnızca admin.
- Öğrenciye ait her tabloda `user_id uuid not null references auth.users(id) on delete cascade` (hesap silme zinciri buna dayanır).
- Göçler yalnızca eklenir (`supabase migration new <ad>`); uygulanmış göç dosyası düzenlenmez.
- Seed verisi `supabase/seed/*.csv` ve `placement.json`'dan gelir; içeriği pedagoji sahibi düzenler, sen değiştirme.
- Göçten sonra türleri yeniden üret (`npx supabase gen types typescript --local > lib/db/types.ts`).
- RLS'i iki test kullanıcısıyla SQL üzerinden doğrula (SPEC Bölüm 3 sonu).
