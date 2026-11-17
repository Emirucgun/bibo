-- M9 + M10 (docs/PLAN.md "M9 + M10", karar 31–37).
-- 1) `auto_join_invite_code`: doluysa davet adımındaki kullanıcı bu koda otomatik katılır
--    (iç test / açık deneme için; boş = yalnızca davet kodu). Kohort kapasitesi yine `claim_invite`'ta.
-- 2) Yönetim paneli için özet fonksiyonları: yalnızca sayı döner, içerik yok. Servis istemcisi çağırır.

insert into public.app_settings (key, value) values
  ('auto_join_invite_code', 'null')
on conflict (key) do nothing;

-- Sağlayıcıya göre ay içi maliyet ve kullanım (SPEC 6 `GET /api/admin/overview`).
create function public.admin_usage_since(since timestamptz)
returns table (
  provider text,
  purpose text,
  calls bigint,
  ok_calls bigint,
  cost_usd numeric,
  tts_chars bigint,
  input_tokens bigint,
  cache_read_tokens bigint
)
language sql
stable
set search_path = ''
as $$
  select provider, purpose, count(*), count(*) filter (where ok),
         coalesce(sum(cost_usd), 0), coalesce(sum(tts_chars), 0)::bigint,
         coalesce(sum(input_tokens), 0)::bigint, coalesce(sum(cache_read_tokens), 0)::bigint
  from public.llm_usage
  where created_at >= since
  group by provider, purpose;
$$;

revoke all on function public.admin_usage_since(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_usage_since(timestamptz) to service_role;

-- Öğrenci başına haftalık bitmiş günlük oturum sayıları (haftada ≥ 4 oturum oranı, W4).
create function public.admin_weekly_sessions(since timestamptz)
returns table (user_id uuid, week_start date, sessions bigint)
language sql
stable
set search_path = ''
as $$
  select user_id,
         (date_trunc('week', finished_at at time zone 'Europe/Istanbul'))::date,
         count(*)
  from public.sessions
  where kind = 'daily' and status = 'done' and finished_at >= since
  group by 1, 2;
$$;

revoke all on function public.admin_weekly_sessions(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_weekly_sessions(timestamptz) to service_role;
