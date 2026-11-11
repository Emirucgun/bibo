-- M5: maliyet koruması için yardımcı fonksiyonlar (docs/SPEC.md 5.4, docs/PLAN.md M5 karar 7).
-- PostgREST satır sınırına takılmadan ay içi toplam ve yarışsız oturum maliyeti artırımı.
-- Yalnızca servis rolü çalıştırır; öğrenci ve öğretmen çağıramaz.

create function public.llm_cost_since(since timestamptz)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(cost_usd), 0) from public.llm_usage where created_at >= since;
$$;

create function public.add_session_cost(p_session_id uuid, p_usd numeric)
returns void
language sql
set search_path = ''
as $$
  update public.sessions set cost_usd = cost_usd + p_usd where id = p_session_id;
$$;

revoke all on function public.llm_cost_since(timestamptz) from public, anon, authenticated;
revoke all on function public.add_session_cost(uuid, numeric) from public, anon, authenticated;
grant execute on function public.llm_cost_since(timestamptz) to service_role;
grant execute on function public.add_session_cost(uuid, numeric) to service_role;
