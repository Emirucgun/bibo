-- v2 doğrulaması (supabase/migrations/20261118120000_v2_measurement_curriculum.sql): yeni kısıtlar,
-- learner_state / programs / program_weeks / item_calibration RLS'i, profiles yeni alanları.
-- Tümü tek işlemde çalışır ve sonunda geri alınır.
-- Kullanım: psql "$DB_URL" -v ON_ERROR_STOP=1 -f tests/db/v2-measurement.sql

begin;
\o /dev/null

create temp table _ids (name text primary key, id uuid not null);
grant select on _ids to authenticated;
insert into _ids values ('a', gen_random_uuid()), ('b', gen_random_uuid());

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

create function pg_temp.try(q text) returns text
language plpgsql as $$
begin
  execute q;
  return 'ok';
exception
  when unique_violation then return 'unique_violation';
  when check_violation then return 'check_violation';
  when foreign_key_violation then return 'foreign_key_violation';
end
$$;

insert into auth.users (id, email) select id, name || '-v2@example.test' from _ids;

-- 1) Kısıtlar
select pg_temp.expect('ölçme konuları var', (select count(*) from public.topics where kind = 'measure')::text, '2');
select pg_temp.expect('scope_status varsayılan', (select scope_status from public.profiles where id = pg_temp.uid('a')), 'in_scope');
select pg_temp.expect('geçersiz scope_status reddedilir',
  pg_temp.try(format($$update public.profiles set scope_status = 'gone' where id = %L$$, pg_temp.uid('a'))), 'check_violation');
select pg_temp.expect('study_mode / goal yazılır',
  pg_temp.try(format($$update public.profiles set study_mode = 'self', goal = 'exam' where id = %L$$, pg_temp.uid('a'))), 'ok');
select pg_temp.expect('focus_choice konuya bağlı',
  pg_temp.try(format($$update public.profiles set focus_choice = 'g.yok' where id = %L$$, pg_temp.uid('a'))), 'foreign_key_violation');

insert into public.sessions (id, user_id, kind, status) values ('00000000-0000-0000-0000-0000000000a1', pg_temp.uid('a'), 'daily', 'active');
select pg_temp.expect('yeni amaç: probe',
  pg_temp.try($$insert into public.items (session_id, user_id, position, topic_id, activity_type, skill, mode, purpose, payload)
    select '00000000-0000-0000-0000-0000000000a1', user_id, 1, 'g.can', 'gap_fill', 'writing', 'controlled', 'probe', '{}' from public.sessions where id = '00000000-0000-0000-0000-0000000000a1'$$), 'ok');
select pg_temp.expect('bilinmeyen amaç reddedilir',
  pg_temp.try($$insert into public.items (session_id, user_id, position, topic_id, activity_type, skill, mode, purpose, payload)
    select '00000000-0000-0000-0000-0000000000a1', user_id, 2, 'g.can', 'gap_fill', 'writing', 'controlled', 'teach', '{}' from public.sessions where id = '00000000-0000-0000-0000-0000000000a1'$$), 'check_violation');

-- 2) learner_state: öğrenci yalnızca kendi satırını okur, yazamaz
insert into public.learner_state (user_id, version, state) values (pg_temp.uid('a'), 1, '{}'), (pg_temp.uid('b'), 1, '{}');
select pg_temp.expect('a: kendi learner_state', pg_temp.count_as('a', 'select * from public.learner_state'), '1');
select pg_temp.expect('b: kendi learner_state', pg_temp.count_as('b', format('select * from public.learner_state where user_id = %L', pg_temp.uid('a'))), '0');

-- 3) programs: herkes okur; item_calibration: öğrenci okuyamaz
insert into public.programs (id, name) values ('test-uni-a1', 'Test Üniversitesi A1 kur');
insert into public.program_weeks (program_id, week_start, topic_id) values ('test-uni-a1', '2026-11-16', 'g.be_present');
select pg_temp.expect('a: programs okunur', pg_temp.count_as('a', 'select * from public.programs'), '1');
select pg_temp.expect('a: program_weeks okunur', pg_temp.count_as('a', 'select * from public.program_weeks'), '1');
select pg_temp.expect('hafta pazartesi olmalı',
  pg_temp.try($$insert into public.program_weeks (program_id, week_start, topic_id) values ('test-uni-a1', '2026-11-18', 'g.can')$$), 'check_violation');
insert into public.item_calibration (item_id, a, b, n) values ('a1-01', 1, -1, 30);
select pg_temp.expect('a: item_calibration okunamaz', pg_temp.count_as('a', 'select * from public.item_calibration'), '0');

-- 4) Hesap silme zinciri
delete from auth.users where id = pg_temp.uid('a');
select pg_temp.expect('learner_state silindi', (select count(*) from public.learner_state where user_id = pg_temp.uid('a'))::text, '0');

-- 5) RLS'i kapalı tablo yok
select pg_temp.expect('RLS kapalı public tablo',
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity)::text, '0');

\o
rollback;
