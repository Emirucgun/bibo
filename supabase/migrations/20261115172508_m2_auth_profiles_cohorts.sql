-- M2: giriş, davet ve onam (docs/SPEC.md Bölüm 3 "Satır düzeyi güvenlik", Bölüm 7).
-- 1. Yeni auth.users satırında profiles satırı (tetikleyici).
-- 2. profiles ve cohorts RLS politikaları (M1 ve M3 bunları M2'ye bırakmıştı).
-- 3. claim_invite: davet kodunu kapasite kontrolüyle, yarışsız kullanır.
-- Yazmalar Route Handler'da servis istemcisiyle yapılır; öğrenciye yazma politikası yok.

-- ---------------------------------------------------------------------------
-- 1. Yeni kullanıcıda profiles satırı
-- private şeması API'ye açık değil; security definer, profiles RLS'ine takılmadan yazar.
-- ---------------------------------------------------------------------------

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(left(btrim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    )), 80), '')
  )
  on conflict (id) do nothing;
  return new;
end
$$;

revoke all on function private.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Tetikleyiciden önce açılmış hesap varsa (ör. panelden eklenen) eksik satırı tamamla.
insert into public.profiles (id, display_name)
select
  u.id,
  nullif(left(btrim(coalesce(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    ''
  )), 80), '')
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. RLS politikaları
-- ---------------------------------------------------------------------------

-- Öğretmenin kendi kohortu; security definer, profiles politikasının kendini çağırmasını önler.
create function private.user_cohort_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.cohort_id from public.profiles p where p.id = (select auth.uid())
$$;

revoke all on function private.user_cohort_id() from public;
grant execute on function private.user_cohort_id() to authenticated;

-- profiles: öğrenci kendi satırını, öğretmen kendi kohortunu okur; admin her şeyi yapar.
-- display_name, interests, explain_mode güncellemesi sunucu üzerinden (PATCH /api/profile, M6).
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_select_teacher on public.profiles
  for select to authenticated
  using (
    (select private.user_role()) = 'teacher'
    and cohort_id = (select private.user_cohort_id())
  );
create policy profiles_admin_all on public.profiles
  for all to authenticated
  using ((select private.user_role()) = 'admin')
  with check ((select private.user_role()) = 'admin');

-- cohorts: öğrenci göremez (kohort adı davet yanıtında döner); öğretmen okur; admin her şeyi yapar.
create policy cohorts_select_teacher on public.cohorts
  for select to authenticated
  using ((select private.user_role()) = 'teacher');
create policy cohorts_admin_all on public.cohorts
  for all to authenticated
  using ((select private.user_role()) = 'admin')
  with check ((select private.user_role()) = 'admin');

create index profiles_cohort_id_idx on public.profiles (cohort_id);

-- ---------------------------------------------------------------------------
-- 3. Davet kodunu kullan (POST /api/onboarding/invite)
-- Kohort satırı kilitlenir: aynı anda gelen iki istek kapasiteyi aşamaz.
-- status: ok | already_joined | invalid_code | full | no_profile
-- Kapasiteye kohorttaki tüm profiles satırları sayılır (rol ayrımı yok).
-- Yalnızca servis rolü çalıştırır.
-- ---------------------------------------------------------------------------

create function public.claim_invite(p_user_id uuid, p_code text)
returns table (status text, cohort_name text)
language plpgsql
set search_path = ''
as $$
declare
  v_cohort public.cohorts%rowtype;
  v_profile public.profiles%rowtype;
  v_used int;
begin
  select * into v_profile from public.profiles p where p.id = p_user_id for update;
  if not found then
    return query select 'no_profile'::text, null::text;
    return;
  end if;

  -- Zaten bir kohortta: kod ne olursa olsun yeniden yer ayrılmaz.
  if v_profile.cohort_id is not null then
    return query
      select 'already_joined'::text, c.name from public.cohorts c where c.id = v_profile.cohort_id;
    return;
  end if;

  select * into v_cohort from public.cohorts c where c.invite_code = p_code for update;
  if not found then
    return query select 'invalid_code'::text, null::text;
    return;
  end if;

  select count(*) into v_used from public.profiles p where p.cohort_id = v_cohort.id;
  if v_used >= v_cohort.capacity then
    return query select 'full'::text, v_cohort.name;
    return;
  end if;

  update public.profiles p
     set cohort_id = v_cohort.id,
         onboarding_step = case when p.onboarding_step = 'invite' then 'consent' else p.onboarding_step end,
         updated_at = now()
   where p.id = p_user_id;

  return query select 'ok'::text, v_cohort.name;
end
$$;

revoke all on function public.claim_invite(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_invite(uuid, text) to service_role;
