-- SPEC rev. 3 (11.11.2026): aylık tavan OpenRouter kredi komisyonunu da kapsar.
-- Dil modeli ve transkript maliyeti `llm_usage.cost_usd`'ye `× (1 + oran)` olarak yazılır.
-- Oran OpenRouter kredi ekranından doğrulanır; değişirse yönetim panelinden güncellenir.
insert into public.app_settings (key, value) values
  ('openrouter_fee_rate', '0.055')
on conflict (key) do nothing;
