-- M2 doğrulaması (docs/ROADMAP.md M2 "Bitti testi"): profil tetikleyicisi, davet ve kapasite,
-- rıza kaydı, profiles/cohorts RLS'i ve hesap silme zinciri.
-- Tümü tek işlemde çalışır ve sonunda geri alınır: dev projesinde de güvenle çalıştırılabilir.
-- Kullanım: psql "$DB_URL" -v ON_ERROR_STOP=1 -f tests/db/m2-auth.sql
-- Herhangi bir doğrulama tutmazsa hata fırlatır ve psql sıfır olmayan kodla çıkar.

begin;
\o /dev/null

create temp table _ids (name text primary key, id uuid not null);
grant select on _ids to authenticated;
insert into _ids values
  ('student_a', gen_random_uuid()),
  ('student_b', gen_random_uuid()),
  ('student_c', gen_random_uuid()),
  ('teacher',   gen_random_uuid()),
  ('admin',     gen_random_uuid());

create temp table _cohorts (name text primary key, id uuid not null);
grant select on _cohorts to authenticated;

create function pg_temp.uid(who text) returns uuid
language sql as $$ select id from _ids where name = who $$;

create function pg_temp.expect(label text, got text, want text) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'BAŞARISIZ: % → % (beklenen %)', label, got, want;
  end if;
  raise notice 'tamam: % → %', label, got;
end
$$;

-- Verilen kullanıcı olarak sorgu çalıştırıp satır sayısını döndürür (-1: izin hatası).
create function pg_temp.count_as(who text, q text) returns text
language plpgsql as $$
declare
  n bigint;
begin
  perform set_config('request.jwt.claim.sub', pg_temp.uid(who)::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.uid(who), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute format('select count(*) from (%s) q', q) into n;
  exception when insufficient_privilege then
    n := -1;
  end;
  execute 'reset role';
  return n::text;
end
$$;

-- Verilen kullanıcı olarak yazma dener; etkilenen satır sayısını döndürür (-1: izin hatası).
create function pg_temp.write_as(who text, q text) returns text
language plpgsql as $$
declare
  n bigint;
begin
  perform set_config('request.jwt.claim.sub', pg_temp.uid(who)::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.uid(who), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute q;
    get diagnostics n = row_count;
  exception when insufficient_privilege then
    n := -1;
  end;
  execute 'reset role';
  return n::text;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. Tetikleyici: yeni auth.users satırı → profiles satırı
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data)
select id, name || '@m2-test.invalid',
       case name
         when 'student_a' then '{"full_name": "  Ayşe Test  "}'::jsonb
         when 'student_b' then '{"name": "Berk Test"}'::jsonb
         else '{}'::jsonb
       end
from _ids;

select pg_temp.expect('tetikleyici: profiles satır sayısı',
  (select count(*)::text from public.profiles where id in (select id from _ids)), '5');
select pg_temp.expect('tetikleyici: display_name (full_name, kırpılmış)',
  (select display_name from public.profiles where id = pg_temp.uid('student_a')), 'Ayşe Test');
select pg_temp.expect('tetikleyici: display_name (name)',
  (select display_name from public.profiles where id = pg_temp.uid('student_b')), 'Berk Test');
select pg_temp.expect('tetikleyici: ad yoksa null',
  (select coalesce(display_name, '<null>') from public.profiles where id = pg_temp.uid('student_c')), '<null>');
select pg_temp.expect('tetikleyici: varsayılan rol ve adım',
  (select role || '/' || onboarding_step || '/' || coalesce(cohort_id::text, '<null>')
     from public.profiles where id = pg_temp.uid('student_a')), 'student/invite/<null>');

-- Roller yalnızca SQL ile atanır.
update public.profiles set role = 'teacher' where id = pg_temp.uid('teacher');
update public.profiles set role = 'admin' where id = pg_temp.uid('admin');

-- ---------------------------------------------------------------------------
-- 2. Davet: geçersiz kod, kapasite 1, ikinci kullanıcı reddedilir
-- ---------------------------------------------------------------------------

with c as (
  insert into public.cohorts (name, invite_code, capacity)
  values ('M2 test (kapasite 1)', 'M2TEST-ONE', 1), ('M2 test (diğer)', 'M2TEST-OTHER', 60)
  returning name, id
)
insert into _cohorts select name, id from c;

select pg_temp.expect('davet: geçersiz kod',
  (select status from public.claim_invite(pg_temp.uid('student_a'), 'YOK-BOYLE-KOD')), 'invalid_code');
select pg_temp.expect('davet: geçersiz koddan sonra adım değişmez',
  (select onboarding_step || '/' || coalesce(cohort_id::text, '<null>')
     from public.profiles where id = pg_temp.uid('student_a')), 'invite/<null>');
select pg_temp.expect('davet: profili olmayan kullanıcı',
  (select status from public.claim_invite(gen_random_uuid(), 'M2TEST-ONE')), 'no_profile');

select pg_temp.expect('davet: A kapasite 1 kohorta girer',
  (select status || '/' || cohort_name from public.claim_invite(pg_temp.uid('student_a'), 'M2TEST-ONE')),
  'ok/M2 test (kapasite 1)');
select pg_temp.expect('davet: A adımı consent, kohortu dolu',
  (select onboarding_step || '/' || (cohort_id = (select id from _cohorts where name = 'M2 test (kapasite 1)'))::text
     from public.profiles where id = pg_temp.uid('student_a')), 'consent/true');

select pg_temp.expect('davet: B aynı kohortta full (→ 409)',
  (select status from public.claim_invite(pg_temp.uid('student_b'), 'M2TEST-ONE')), 'full');
select pg_temp.expect('davet: B reddedilince adım ve kohort değişmez',
  (select onboarding_step || '/' || coalesce(cohort_id::text, '<null>')
     from public.profiles where id = pg_temp.uid('student_b')), 'invite/<null>');

select pg_temp.expect('davet: A tekrar çağırırsa already_joined',
  (select status || '/' || cohort_name from public.claim_invite(pg_temp.uid('student_a'), 'M2TEST-OTHER')),
  'already_joined/M2 test (kapasite 1)');
select pg_temp.expect('davet: kapasite 1 kohortta tek kişi',
  (select count(*)::text from public.profiles
    where cohort_id = (select id from _cohorts where name = 'M2 test (kapasite 1)')), '1');

-- Öğretmen kapasite 1 kohortun öğretmeni (SQL ile atanır), C diğer kohorta girer.
update public.profiles
   set cohort_id = (select id from _cohorts where name = 'M2 test (diğer)')
 where id = pg_temp.uid('teacher');
select pg_temp.expect('davet: C diğer kohorta girer',
  (select status from public.claim_invite(pg_temp.uid('student_c'), 'M2TEST-OTHER')), 'ok');

-- claim_invite'ı giriş yapmış kullanıcı doğrudan çağıramaz (yalnızca servis rolü).
select pg_temp.expect('davet: authenticated claim_invite çağıramaz',
  pg_temp.count_as('student_b',
    format('select * from public.claim_invite(%L, %L)', pg_temp.uid('student_b'), 'M2TEST-OTHER')), '-1');

-- ---------------------------------------------------------------------------
-- 3. Rıza: POST /api/onboarding/consent'in yaptığı koşullu güncelleme
-- ---------------------------------------------------------------------------

create function pg_temp.consent(who text) returns text
language plpgsql as $$
declare
  n bigint;
begin
  update public.profiles
     set adult_confirmed_at = now(), consent_version = '2026-11-pilot-v1', consent_at = now(),
         onboarding_step = 'profile', updated_at = now()
   where id = pg_temp.uid(who) and onboarding_step = 'consent';
  get diagnostics n = row_count;
  return n::text;
end
$$;

select pg_temp.expect('rıza: davetsiz B için güncelleme 0 satır', pg_temp.consent('student_b'), '0');
select pg_temp.expect('rıza: B hâlâ invite adımında, rıza alanları boş',
  (select onboarding_step || '/' || coalesce(consent_version, '<null>') || '/' || coalesce(consent_at::text, '<null>')
     from public.profiles where id = pg_temp.uid('student_b')), 'invite/<null>/<null>');
select pg_temp.expect('rıza: davetli A için güncelleme 1 satır', pg_temp.consent('student_a'), '1');
select pg_temp.expect('rıza: sürüm, zaman ve 18+ beyanı profiles''ta',
  (select consent_version || '/' || (consent_at is not null)::text || '/' || (adult_confirmed_at is not null)::text
          || '/' || onboarding_step
     from public.profiles where id = pg_temp.uid('student_a')), '2026-11-pilot-v1/true/true/profile');

-- ---------------------------------------------------------------------------
-- 4. RLS: profiles ve cohorts
-- ---------------------------------------------------------------------------

select pg_temp.expect('RLS: A yalnızca kendi profilini görür',
  pg_temp.count_as('student_a', 'select * from public.profiles'), '1');
select pg_temp.expect('RLS: A, B''nin profilini okuyamaz',
  pg_temp.count_as('student_a', 'select * from public.profiles where id = (select id from _ids where name = ''student_b'')'), '0');
select pg_temp.expect('RLS: B, A''nın profilini okuyamaz',
  pg_temp.count_as('student_b', 'select * from public.profiles where id = (select id from _ids where name = ''student_a'')'), '0');
select pg_temp.expect('RLS: öğrenci cohorts göremez',
  pg_temp.count_as('student_a', 'select * from public.cohorts'), '0');

-- Öğrenci profilini doğrudan değiştiremez (rol yükseltme, rıza ve adım atlatma dahil).
select pg_temp.expect('RLS: öğrenci kendi rolünü değiştiremez',
  pg_temp.write_as('student_b', 'update public.profiles set role = ''admin'' where id = (select auth.uid())'), '0');
select pg_temp.expect('RLS: öğrenci adımı atlayamaz',
  pg_temp.write_as('student_b', 'update public.profiles set onboarding_step = ''done'' where id = (select auth.uid())'), '0');
select pg_temp.expect('RLS: B hâlâ student/invite',
  (select role || '/' || onboarding_step from public.profiles where id = pg_temp.uid('student_b')), 'student/invite');
select pg_temp.expect('RLS: öğrenci profil ekleyemez',
  pg_temp.write_as('student_b', 'insert into public.profiles (id) values (gen_random_uuid())'), '-1');
select pg_temp.expect('RLS: öğrenci başkasının profilini silemez',
  pg_temp.write_as('student_b', 'delete from public.profiles'), '0');
select pg_temp.expect('RLS: öğrenci kohort ekleyemez',
  pg_temp.write_as('student_b', 'insert into public.cohorts (name, invite_code) values (''x'', ''x'')'), '-1');

-- Öğretmen: kendi profili + kendi kohortu (C); diğer kohorttaki A'yı ve kohortsuz B'yi göremez.
select pg_temp.expect('RLS: öğretmen kendi kohortunu görür (kendisi + C)',
  pg_temp.count_as('teacher', 'select * from public.profiles'), '2');
select pg_temp.expect('RLS: öğretmen başka kohorttaki A''yı göremez',
  pg_temp.count_as('teacher', 'select * from public.profiles where id = (select id from _ids where name = ''student_a'')'), '0');
select pg_temp.expect('RLS: öğretmen cohorts okur',
  pg_temp.count_as('teacher', 'select * from public.cohorts where id in (select id from _cohorts)'), '2');
select pg_temp.expect('RLS: öğretmen profil güncelleyemez',
  pg_temp.write_as('teacher', 'update public.profiles set role = ''admin'''), '0');

-- Admin: tümü.
select pg_temp.expect('RLS: admin tüm test profillerini görür',
  pg_temp.count_as('admin', 'select * from public.profiles where id in (select id from _ids)'), '5');
select pg_temp.expect('RLS: admin kohort günceller',
  pg_temp.write_as('admin', 'update public.cohorts set capacity = 2 where invite_code = ''M2TEST-ONE'''), '1');

-- Kapasite 2'ye çıkınca B girebilir.
select pg_temp.expect('davet: kapasite artınca B girer',
  (select status from public.claim_invite(pg_temp.uid('student_b'), 'M2TEST-ONE')), 'ok');

-- ---------------------------------------------------------------------------
-- 5. Hesap silme: auth.users satırı gidince profiles satırı da gider, yer açılır
-- ---------------------------------------------------------------------------

delete from auth.users where id = pg_temp.uid('student_a');
select pg_temp.expect('silme: auth.users satırı yok',
  (select count(*)::text from auth.users where id = pg_temp.uid('student_a')), '0');
select pg_temp.expect('silme: profiles satırı yok',
  (select count(*)::text from public.profiles where id = pg_temp.uid('student_a')), '0');
select pg_temp.expect('silme: diğer kullanıcılar duruyor',
  (select count(*)::text from public.profiles where id in (select id from _ids)), '4');

rollback;
