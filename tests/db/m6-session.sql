-- M6 doğrulaması (docs/ROADMAP.md M6): `sessions.status`'ta `generating`, öğrenci başına tek
-- `generating`/`ready` oturum, `item_keys`'in öğrenciye kapalı olması ve oturum tablolarının RLS'i.
-- Tümü tek işlemde çalışır ve sonunda geri alınır: dev projesinde de güvenle çalıştırılabilir.
-- Kullanım: psql "$DB_URL" -v ON_ERROR_STOP=1 -f tests/db/m6-session.sql

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

-- Bir ifadeyi dener: 'ok' ya da hata sınıfı (unique_violation, check_violation …).
create function pg_temp.try(q text) returns text
language plpgsql as $$
begin
  execute q;
  return 'ok';
exception
  when unique_violation then return 'unique_violation';
  when check_violation then return 'check_violation';
end
$$;

insert into auth.users (id, email)
select id, name || '-m6@example.test' from _ids;

-- 1) `generating` durumu ve kısıt
select pg_temp.expect('generating eklenebilir',
  pg_temp.try(format($$insert into public.sessions (user_id, kind, status) values (%L, 'daily', 'generating')$$, pg_temp.uid('a'))),
  'ok');
select pg_temp.expect('bilinmeyen durum reddedilir',
  pg_temp.try(format($$insert into public.sessions (user_id, kind, status) values (%L, 'daily', 'pending')$$, pg_temp.uid('b'))),
  'check_violation');

-- 2) Öğrenci başına tek `generating` / `ready`
select pg_temp.expect('ikinci generating reddedilir',
  pg_temp.try(format($$insert into public.sessions (user_id, kind, status) values (%L, 'daily', 'generating')$$, pg_temp.uid('a'))),
  'unique_violation');
select pg_temp.expect('generating varken ready reddedilir',
  pg_temp.try(format($$insert into public.sessions (user_id, kind, status) values (%L, 'daily', 'ready')$$, pg_temp.uid('a'))),
  'unique_violation');
select pg_temp.expect('başka öğrenci etkilenmez',
  pg_temp.try(format($$insert into public.sessions (user_id, kind, status) values (%L, 'daily', 'generating')$$, pg_temp.uid('b'))),
  'ok');

-- generating → ready → active: aktifken yeni oturum hazırlanabilir
update public.sessions set status = 'ready' where user_id = pg_temp.uid('a');
update public.sessions set status = 'active', started_at = now() where user_id = pg_temp.uid('a');
select pg_temp.expect('active varken yeni generating',
  pg_temp.try(format($$insert into public.sessions (user_id, kind, status) values (%L, 'daily', 'generating')$$, pg_temp.uid('a'))),
  'ok');
select pg_temp.expect('done/abandoned/failed sınırsız',
  pg_temp.try(format($$insert into public.sessions (user_id, kind, status)
    select %L, 'daily', s from unnest(array['done','done','abandoned','abandoned','failed','failed']) s$$, pg_temp.uid('a'))),
  'ok');

-- 3) Etkinlik, anahtar, cevap: A'nın verisi
with s as (
  select id from public.sessions where user_id = pg_temp.uid('a') and status = 'active'
), i as (
  insert into public.items (session_id, user_id, position, topic_id, activity_type, skill, mode, purpose, payload)
  select s.id, pg_temp.uid('a'), 1, (select id from public.topics order by sort limit 1),
         'gap_fill', 'writing', 'controlled', 'focus', '{"instruction_tr":"Boşluğu doldur.","text_en":"She ___ tennis."}'
  from s returning id
), k as (
  insert into public.item_keys (item_id, key)
  select id, '{"accepted":["plays"],"hint_tr":"Özne kim?"}' from i returning item_id
)
insert into public.attempts (item_id, user_id, response, is_correct, score, graded_by)
select item_id, pg_temp.uid('a'), '{"text":"play"}', false, 0, 'local' from k;

insert into public.mastery (user_id, topic_id, skill, score, n)
select pg_temp.uid('a'), (select id from public.topics order by sort limit 1), 'writing', 0.4, 1;

select pg_temp.expect('A kendi oturumlarını görür', pg_temp.count_as('a', 'select 1 from public.sessions'), '8');
select pg_temp.expect('A kendi etkinliğini görür', pg_temp.count_as('a', 'select 1 from public.items'), '1');
select pg_temp.expect('A kendi cevabını görür', pg_temp.count_as('a', 'select 1 from public.attempts'), '1');
select pg_temp.expect('A item_keys göremez', pg_temp.count_as('a', 'select 1 from public.item_keys'), '0');
select pg_temp.expect('B, A''nın etkinliğini göremez', pg_temp.count_as('b', 'select 1 from public.items'), '0');
select pg_temp.expect('B, A''nın cevabını göremez', pg_temp.count_as('b', 'select 1 from public.attempts'), '0');
select pg_temp.expect('B, A''nın ustalığını göremez', pg_temp.count_as('b', 'select 1 from public.mastery'), '0');
select pg_temp.expect('B yalnızca kendi oturumunu görür', pg_temp.count_as('b', 'select 1 from public.sessions'), '1');
select pg_temp.expect('B item_keys göremez', pg_temp.count_as('b', 'select 1 from public.item_keys'), '0');

-- 4) Aynı etkinliğe ikinci cevap (try_no = 1) reddedilir
select pg_temp.expect('(item_id, try_no) tekil',
  pg_temp.try(format($$insert into public.attempts (item_id, user_id, response)
    select id, %L, '{"text":"plays"}' from public.items where user_id = %L$$, pg_temp.uid('a'), pg_temp.uid('a'))),
  'unique_violation');

\o
select 'M6 veritabanı doğrulaması geçti' as sonuc;
rollback;
