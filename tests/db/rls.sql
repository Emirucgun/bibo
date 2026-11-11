-- M3 RLS ve seed doğrulaması (docs/ROADMAP.md M3 "Bitti testi").
-- Tümü tek işlemde çalışır ve sonunda geri alınır: dev projesinde de güvenle çalıştırılabilir.
-- Kullanım: psql "$DB_URL" -v ON_ERROR_STOP=1 -f tests/db/rls.sql
-- Herhangi bir doğrulama tutmazsa hata fırlatır ve psql sıfır olmayan kodla çıkar.

begin;
\o /dev/null

create temp table _ids (name text primary key, id uuid not null);
grant select on _ids to authenticated;
insert into _ids values
  ('student_a', gen_random_uuid()),
  ('student_b', gen_random_uuid()),
  ('teacher',   gen_random_uuid()),
  ('admin',     gen_random_uuid());

insert into auth.users (id, email)
select id, name || '@rls-test.invalid' from _ids;

-- Supabase'de profiles satırı M2 tetikleyicisiyle gelecek; burada elle ve yoksa ekle.
insert into public.profiles (id, role)
select id, case name when 'teacher' then 'teacher' when 'admin' then 'admin' else 'student' end
from _ids
on conflict (id) do update set role = excluded.role;

-- Her öğrenciye birer satır (servis istemcisi gibi, RLS'siz).
do $$
declare
  u record;
  s uuid;
  i uuid;
  a uuid;
begin
  for u in select id from _ids where name like 'student_%' loop
    insert into public.sessions (user_id, kind) values (u.id, 'daily') returning id into s;
    insert into public.items (session_id, user_id, position, topic_id, activity_type, skill, mode, purpose, payload)
      values (s, u.id, 0, 'g.be_present', 'mcq_read', 'reading', 'recognition', 'focus', '{}')
      returning id into i;
    insert into public.item_keys (item_id, key) values (i, '{"correct": "is"}');
    insert into public.attempts (item_id, user_id, response, is_correct, score, graded_by)
      values (i, u.id, '{"choice": "x"}', false, 0, 'local') returning id into a;
    insert into public.error_events (attempt_id, user_id, topic_id, skill, activity_type, mode, l1_code, source)
      values (a, u.id, 'g.be_present', 'reading', 'mcq_read', 'recognition', 'L1.BE_OMIT', 'distractor');
    insert into public.mastery (user_id, topic_id, skill, score) values (u.id, 'g.be_present', 'reading', 0.4);
    insert into public.diagnoses (user_id, topic_id, kind, confidence, evidence, message_tr)
      values (u.id, 'g.be_present', 'topic_gap', 0.7, '{}', 'test');
    insert into public.events (user_id, name) values (u.id, 'app_open');
  end loop;
  insert into public.llm_usage (user_id, purpose, provider, model, ok)
    select id, 'generate', 'openrouter', 'test', true from _ids where name = 'student_a';
end
$$;

-- Yardımcı: verilen kullanıcı olarak sorgu çalıştırıp satır sayısını döndürür.
create function pg_temp.count_as(who text, q text) returns bigint
language plpgsql as $$
declare
  uid uuid;
  n bigint;
begin
  select id into uid from _ids where name = who;
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute format('select count(*) from (%s) q', q) into n;
  exception when insufficient_privilege then
    n := -1;  -- izin hatası
  end;
  execute 'reset role';
  return n;
end
$$;

create function pg_temp.expect(label text, got bigint, want bigint) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'BAŞARISIZ: % → % (beklenen %)', label, got, want;
  end if;
  raise notice 'tamam: % → %', label, got;
end
$$;

-- 1. Seed sayıları
select pg_temp.expect('topics sayısı', (select count(*) from public.topics), 32);
select pg_temp.expect('l1_codes sayısı', (select count(*) from public.l1_codes), 24);

-- 2. L1.LITERAL dışındaki her L1.* kodunun geçerli topic_id'si var
select pg_temp.expect(
  'topic_id eksik L1 kodu',
  (select count(*) from public.l1_codes c
     left join public.topics t on t.id = c.topic_id
   where c.code like 'L1.%' and c.code <> 'L1.LITERAL' and t.id is null),
  0);

-- 3. item_keys: öğrenci, öğretmen ve admin hiçbir satır göremez
select pg_temp.expect('student_a: item_keys', pg_temp.count_as('student_a', 'select * from public.item_keys'), 0);
select pg_temp.expect('teacher: item_keys',   pg_temp.count_as('teacher',   'select * from public.item_keys'), 0);
select pg_temp.expect('admin: item_keys',     pg_temp.count_as('admin',     'select * from public.item_keys'), 0);

-- 4. Öğrenci A yalnızca kendi satırlarını görür (B'ninkileri göremez)
select pg_temp.expect('student_a: sessions', pg_temp.count_as('student_a', 'select * from public.sessions'), 1);
select pg_temp.expect('student_a: B''nin sessions',
  pg_temp.count_as('student_a', 'select * from public.sessions where user_id = (select id from _ids where name = ''student_b'')'), 0);
select pg_temp.expect('student_a: items',        pg_temp.count_as('student_a', 'select * from public.items'), 1);
select pg_temp.expect('student_a: attempts',     pg_temp.count_as('student_a', 'select * from public.attempts'), 1);
select pg_temp.expect('student_a: error_events', pg_temp.count_as('student_a', 'select * from public.error_events'), 1);
select pg_temp.expect('student_a: mastery',      pg_temp.count_as('student_a', 'select * from public.mastery'), 1);
select pg_temp.expect('student_a: diagnoses',    pg_temp.count_as('student_a', 'select * from public.diagnoses'), 1);
select pg_temp.expect('student_a: events',       pg_temp.count_as('student_a', 'select * from public.events'), 1);
select pg_temp.expect('student_a: topics',       pg_temp.count_as('student_a', 'select * from public.topics'), 32);
select pg_temp.expect('student_a: l1_codes',     pg_temp.count_as('student_a', 'select * from public.l1_codes'), 24);

-- 5. Öğrenci yalnızca-admin tablolarını göremez
select pg_temp.expect('student_a: llm_usage',       pg_temp.count_as('student_a', 'select * from public.llm_usage'), 0);
select pg_temp.expect('student_a: app_settings',    pg_temp.count_as('student_a', 'select * from public.app_settings'), 0);
select pg_temp.expect('student_a: tts_cache',       pg_temp.count_as('student_a', 'select * from public.tts_cache'), 0);
select pg_temp.expect('student_a: teacher_reviews', pg_temp.count_as('student_a', 'select * from public.teacher_reviews'), 0);

-- 6. Öğretmen inceleme için tüm öğrenci satırlarını görür, admin tablolarını göremez
select pg_temp.expect('teacher: sessions',     pg_temp.count_as('teacher', 'select * from public.sessions'), 2);
select pg_temp.expect('teacher: error_events', pg_temp.count_as('teacher', 'select * from public.error_events'), 2);
select pg_temp.expect('teacher: llm_usage',    pg_temp.count_as('teacher', 'select * from public.llm_usage'), 0);
select pg_temp.expect('teacher: app_settings', pg_temp.count_as('teacher', 'select * from public.app_settings'), 0);

-- 7. Admin her şeyi görür (item_keys hariç, yukarıda)
select pg_temp.expect('admin: sessions',     pg_temp.count_as('admin', 'select * from public.sessions'), 2);
select pg_temp.expect('admin: llm_usage',    pg_temp.count_as('admin', 'select * from public.llm_usage'), 1);
select pg_temp.expect('admin: app_settings', pg_temp.count_as('admin', 'select * from public.app_settings'),
  (select count(*) from public.app_settings));

-- 8. Öğrenci doğrudan yazamaz (yazmalar servis istemcisiyle)
do $$
declare
  uid uuid;
  ok bool := false;
begin
  select id into uid from _ids where name = 'student_a';
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.mastery (user_id, topic_id, skill, score) values (uid, 'g.can', 'reading', 1);
  exception when insufficient_privilege then
    ok := true;
  end;
  reset role;
  if not ok then
    raise exception 'BAŞARISIZ: öğrenci mastery''e yazabildi';
  end if;
  raise notice 'tamam: öğrenci mastery''e yazamıyor';
end
$$;

-- 9. public şemasında RLS'i kapalı tablo yok
select pg_temp.expect(
  'RLS kapalı public tablo',
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0);

-- 10. Hesap silme zinciri: auth.users satırı gidince öğrenci verisi gider, maliyet satırı kalır
delete from auth.users where id = (select id from _ids where name = 'student_a');
select pg_temp.expect('silinen A: sessions',
  (select count(*) from public.sessions where user_id = (select id from _ids where name = 'student_a')), 0);
select pg_temp.expect('silinen A: attempts', (select count(*) from public.attempts a
  join public.items i on i.id = a.item_id where i.user_id = (select id from _ids where name = 'student_a')), 0);
select pg_temp.expect('silinen A: llm_usage satırı kişisiz kalır',
  (select count(*) from public.llm_usage where user_id is null and model = 'test'), 1);

rollback;
