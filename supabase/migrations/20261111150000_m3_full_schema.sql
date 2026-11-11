-- M3: kalan tüm tablolar, indeksler, check kısıtları ve RLS politikaları (docs/SPEC.md Bölüm 3).
-- cohorts ve profiles politikaları M2'de gelir; app_settings politikaları burada.
-- Sabit kümeler lib/content/activity-types.ts ve lib/content/interests.ts ile aynıdır
-- (tests/content/constants.test.ts bu dosyayla karşılaştırır).

-- ---------------------------------------------------------------------------
-- Rol yardımcısı (RLS politikaları için)
-- private şeması API'ye açık değil; security definer, profiles RLS'ine takılmadan rolü okur.
-- ---------------------------------------------------------------------------

create schema if not exists private;
grant usage on schema private to authenticated;

create function private.user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid())
$$;

revoke all on function private.user_role() from public;
grant execute on function private.user_role() to authenticated;

-- ---------------------------------------------------------------------------
-- İçerik: topics, l1_codes (seed: supabase/seed/*.csv → supabase/seed.sql)
-- ---------------------------------------------------------------------------

create table public.topics (
  id text primary key,
  level text not null check (level in ('A1', 'A2')),
  kind text not null check (kind in ('grammar', 'pron')),
  title_tr text not null,
  title_en text not null,
  description_tr text not null,
  l1_risk smallint not null check (l1_risk between 0 and 2),
  prereqs text[] not null default '{}',
  sort int not null,
  active bool not null default true
);

alter table public.topics enable row level security;

create table public.l1_codes (
  code text primary key check (code ~ '^(L1|GEN)\.[A-Z0-9_]+$'),
  topic_id text references public.topics (id),
  is_l1 bool not null,
  name_tr text not null,
  rule_tr text,
  wrong_example text,
  right_example text
);

alter table public.l1_codes enable row level security;

-- ---------------------------------------------------------------------------
-- Oturumlar ve etkinlikler
-- ---------------------------------------------------------------------------

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('placement', 'daily')),
  status text not null default 'ready'
    check (status in ('ready', 'active', 'done', 'abandoned', 'failed')),
  plan jsonb,
  focus_topic_id text references public.topics (id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  rating smallint check (rating between 1 and 5),
  comment text check (char_length(comment) <= 500),
  cost_usd numeric(10, 5) not null default 0
);

create index sessions_user_id_status_idx on public.sessions (user_id, status);
create index sessions_user_id_finished_at_idx on public.sessions (user_id, finished_at desc);
create index sessions_focus_topic_id_idx on public.sessions (focus_topic_id);

alter table public.sessions enable row level security;

create table public.items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  position smallint not null check (position >= 0),
  topic_id text not null references public.topics (id),
  activity_type text not null check (activity_type in (
    'mcq_read', 'gap_fill', 'word_order', 'listen_choose',
    'dictation', 'translate_tr_en', 'short_write', 'speak_answer'
  )),
  skill text not null check (skill in ('reading', 'listening', 'writing', 'speaking')),
  mode text not null check (mode in ('recognition', 'controlled', 'free')),
  purpose text not null check (purpose in ('placement', 'review', 'focus', 'retest', 'stretch')),
  interest text check (interest in (
    'football', 'other_sports', 'gaming', 'music', 'series_film', 'tech',
    'social_media', 'fashion', 'food', 'travel', 'science_space', 'cars'
  )),
  l1_target text references public.l1_codes (code),
  payload jsonb not null,
  credited bool not null default false,
  created_at timestamptz not null default now(),
  unique (session_id, position)
);

create index items_user_id_idx on public.items (user_id);
create index items_topic_id_idx on public.items (topic_id);
create index items_l1_target_idx on public.items (l1_target);

alter table public.items enable row level security;

-- Cevap anahtarı: öğrenci ve öğretmen için HİÇBİR politika yok; yalnızca servis istemcisi okur.
create table public.item_keys (
  item_id uuid primary key references public.items (id) on delete cascade,
  key jsonb not null
);

alter table public.item_keys enable row level security;

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  try_no smallint not null default 1 check (try_no between 1 and 2),
  response jsonb not null,
  is_correct bool,
  score numeric(3, 2) check (score between 0 and 1),
  time_ms int check (time_ms >= 0),
  hint_used bool not null default false,
  explain_opened bool not null default false,
  graded_by text check (graded_by in ('local', 'llm')),
  feedback_short_tr text,
  explanation_long_tr text,
  correction text,
  created_at timestamptz not null default now(),
  unique (item_id, try_no)
);

create index attempts_user_id_idx on public.attempts (user_id);

alter table public.attempts enable row level security;

-- ---------------------------------------------------------------------------
-- Teşhis verisi
-- ---------------------------------------------------------------------------

create table public.error_events (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  topic_id text references public.topics (id),
  skill text not null check (skill in ('reading', 'listening', 'writing', 'speaking')),
  activity_type text not null check (activity_type in (
    'mcq_read', 'gap_fill', 'word_order', 'listen_choose',
    'dictation', 'translate_tr_en', 'short_write', 'speak_answer'
  )),
  mode text not null check (mode in ('recognition', 'controlled', 'free')),
  l1_code text not null references public.l1_codes (code),
  wrong_span text,
  correction text,
  source text not null check (source in ('distractor', 'llm', 'rule')),
  review_sampled bool not null default false,
  created_at timestamptz not null default now()
);

create index error_events_user_id_l1_code_created_at_idx
  on public.error_events (user_id, l1_code, created_at);
create index error_events_review_sampled_idx
  on public.error_events (review_sampled) where review_sampled;
create index error_events_attempt_id_idx on public.error_events (attempt_id);
create index error_events_topic_id_idx on public.error_events (topic_id);
create index error_events_l1_code_idx on public.error_events (l1_code);

alter table public.error_events enable row level security;

create table public.mastery (
  user_id uuid not null references auth.users (id) on delete cascade,
  topic_id text not null references public.topics (id),
  skill text not null check (skill in ('reading', 'listening', 'writing', 'speaking')),
  score numeric(4, 3) not null check (score between 0 and 1),
  n int not null default 0 check (n >= 0),
  correct int not null default 0 check (correct >= 0),
  last_seen_at timestamptz,
  next_review_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, topic_id, skill)
);

create index mastery_topic_id_idx on public.mastery (topic_id);

alter table public.mastery enable row level security;

create table public.activity_stats (
  user_id uuid not null references auth.users (id) on delete cascade,
  activity_type text not null check (activity_type in (
    'mcq_read', 'gap_fill', 'word_order', 'listen_choose',
    'dictation', 'translate_tr_en', 'short_write', 'speak_answer'
  )),
  taught_n int not null default 0 check (taught_n >= 0),
  retained_n int not null default 0 check (retained_n >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, activity_type)
);

alter table public.activity_stats enable row level security;

create table public.diagnoses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  topic_id text not null references public.topics (id),
  kind text not null check (kind in ('skill_gap', 'topic_gap', 'activity_mismatch')),
  weak_skill text check (weak_skill in ('reading', 'listening', 'writing', 'speaking')),
  weak_activity text check (weak_activity in (
    'mcq_read', 'gap_fill', 'word_order', 'listen_choose',
    'dictation', 'translate_tr_en', 'short_write', 'speak_answer'
  )),
  confidence numeric(3, 2) not null check (confidence between 0 and 1),
  evidence jsonb not null,
  message_tr text not null,
  status text not null default 'active'
    check (status in ('active', 'resolved', 'superseded')),
  shown_at timestamptz,
  user_feedback text check (user_feedback in ('agree', 'disagree')),
  created_at timestamptz not null default now()
);

create index diagnoses_user_id_status_idx on public.diagnoses (user_id, status);
create index diagnoses_topic_id_idx on public.diagnoses (topic_id);

alter table public.diagnoses enable row level security;

create table public.school_topics (
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  topic_id text references public.topics (id),
  created_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

create index school_topics_topic_id_idx on public.school_topics (topic_id);

alter table public.school_topics enable row level security;

-- Altın veri: öğretmen hesabı silinse de karar kalır (reviewer_id → null).
create table public.teacher_reviews (
  id uuid primary key default gen_random_uuid(),
  error_event_id uuid not null unique references public.error_events (id) on delete cascade,
  reviewer_id uuid references public.profiles (id) on delete set null,
  verdict text not null check (verdict in ('agree', 'fix', 'not_error')),
  corrected_l1_code text references public.l1_codes (code),
  note text,
  created_at timestamptz not null default now(),
  check (verdict <> 'fix' or corrected_l1_code is not null)
);

create index teacher_reviews_reviewer_id_idx on public.teacher_reviews (reviewer_id);
create index teacher_reviews_corrected_l1_code_idx on public.teacher_reviews (corrected_l1_code);

alter table public.teacher_reviews enable row level security;

-- ---------------------------------------------------------------------------
-- İşletim: llm_usage, tts_cache, events
-- ---------------------------------------------------------------------------

-- İçerik (komut, öğrenci metni, transkript) bu tabloya yazılmaz; yalnızca sayılar.
-- Hesap silinince maliyet geçmişi kalır, kişiyle bağı kopar.
create table public.llm_usage (
  id bigserial primary key,
  user_id uuid references auth.users (id) on delete set null,
  session_id uuid references public.sessions (id) on delete set null,
  purpose text not null check (purpose in ('generate', 'grade', 'transcribe', 'tts', 'placement')),
  provider text not null,
  model text not null,
  input_tokens int check (input_tokens >= 0),
  output_tokens int check (output_tokens >= 0),
  cache_read_tokens int not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens int not null default 0 check (cache_write_tokens >= 0),
  audio_seconds numeric check (audio_seconds >= 0),
  tts_chars int check (tts_chars >= 0),
  cost_usd numeric(10, 6) not null default 0 check (cost_usd >= 0),
  latency_ms int check (latency_ms >= 0),
  ok bool not null,
  error text,
  created_at timestamptz not null default now()
);

create index llm_usage_created_at_idx on public.llm_usage (created_at);
create index llm_usage_user_id_idx on public.llm_usage (user_id);
create index llm_usage_session_id_idx on public.llm_usage (session_id);

alter table public.llm_usage enable row level security;

create table public.tts_cache (
  hash text primary key,
  voice text not null,
  rate numeric not null,
  storage_path text not null,
  chars int not null check (chars >= 0),
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

alter table public.tts_cache enable row level security;

create table public.events (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  props jsonb,
  created_at timestamptz not null default now()
);

create index events_user_id_created_at_idx on public.events (user_id, created_at);
create index events_name_created_at_idx on public.events (name, created_at);

alter table public.events enable row level security;

-- ---------------------------------------------------------------------------
-- RLS politikaları (SPEC Bölüm 3, "Satır düzeyi güvenlik")
-- Yazmalar Route Handler'da servis istemcisiyle yapılır; öğrenciye yazma politikası yok.
-- ---------------------------------------------------------------------------

-- topics, l1_codes: herkes (giriş yapmış) okur, admin her şeyi yapar.
create policy topics_select on public.topics
  for select to authenticated using (true);
create policy topics_admin_all on public.topics
  for all to authenticated
  using ((select private.user_role()) = 'admin')
  with check ((select private.user_role()) = 'admin');

create policy l1_codes_select on public.l1_codes
  for select to authenticated using (true);
create policy l1_codes_admin_all on public.l1_codes
  for all to authenticated
  using ((select private.user_role()) = 'admin')
  with check ((select private.user_role()) = 'admin');

-- Öğrenci verisi: öğrenci kendi satırlarını, öğretmen tümünü okur; admin her şeyi yapar.
do $$
declare
  t text;
begin
  foreach t in array array[
    'sessions', 'items', 'attempts', 'error_events', 'mastery',
    'diagnoses', 'school_topics', 'activity_stats', 'events'
  ]
  loop
    execute format(
      'create policy %1$s_select_own on public.%1$I
         for select to authenticated
         using (user_id = (select auth.uid()))', t);
    execute format(
      'create policy %1$s_select_teacher on public.%1$I
         for select to authenticated
         using ((select private.user_role()) = ''teacher'')', t);
    execute format(
      'create policy %1$s_admin_all on public.%1$I
         for all to authenticated
         using ((select private.user_role()) = ''admin'')
         with check ((select private.user_role()) = ''admin'')', t);
  end loop;
end
$$;

-- item_keys: politika YOK (admin dahil). Yalnızca servis istemcisi.

-- llm_usage, tts_cache: yalnızca admin okur.
create policy llm_usage_admin_select on public.llm_usage
  for select to authenticated
  using ((select private.user_role()) = 'admin');
create policy tts_cache_admin_select on public.tts_cache
  for select to authenticated
  using ((select private.user_role()) = 'admin');

-- teacher_reviews: öğretmen okur ve kendi adına ekler; admin her şeyi yapar.
create policy teacher_reviews_teacher_select on public.teacher_reviews
  for select to authenticated
  using ((select private.user_role()) = 'teacher');
create policy teacher_reviews_teacher_insert on public.teacher_reviews
  for insert to authenticated
  with check (
    (select private.user_role()) = 'teacher'
    and reviewer_id = (select auth.uid())
  );
create policy teacher_reviews_admin_all on public.teacher_reviews
  for all to authenticated
  using ((select private.user_role()) = 'admin')
  with check ((select private.user_role()) = 'admin');

-- app_settings (M1 tablosu): yalnızca admin okur ve günceller.
create policy app_settings_admin_select on public.app_settings
  for select to authenticated
  using ((select private.user_role()) = 'admin');
create policy app_settings_admin_update on public.app_settings
  for update to authenticated
  using ((select private.user_role()) = 'admin')
  with check ((select private.user_role()) = 'admin');
