-- M7: seslendirme önbelleği için özel `tts` kovası ve aylık karakter sayacı (docs/SPEC.md 3, 5.4, 10).
-- Kova özeldir: nesneler yalnızca servis istemcisiyle yazılır, öğrenci 1 saatlik imzalı URL alır.
-- Storage RLS'te `tts` kovası için hiçbir politika yoktur (anon/authenticated okuyamaz, yazamaz).
-- M8 için göç gerekmez: ses kaydı Storage'a ya da veritabanına yazılmaz (SPEC 10, 11).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tts', 'tts', false, 1048576, array['audio/mpeg'])
on conflict (id) do nothing;

-- Ay içi `sum(llm_usage.tts_chars)`: `tts_monthly_char_alert` uyarısı ve yönetim paneli (M10).
create function public.tts_chars_since(since timestamptz)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(tts_chars), 0)::bigint from public.llm_usage where purpose = 'tts' and created_at >= since;
$$;

revoke all on function public.tts_chars_since(timestamptz) from public, anon, authenticated;
grant execute on function public.tts_chars_since(timestamptz) to service_role;
