-- v2: ölçme, öğrenme profili ve müfredat (docs/SPEC.md 3, 4.1, 4.4, 4.7, 4.8;
-- docs/arastirma/olcme-ve-ogrenen-modeli.md, docs/arastirma/mufredat-onerisi.md).
-- Göçler yalnızca eklenir: önceki tabloların kısıtları burada adla düşürülüp yeniden tanımlanır.

-- ---------------------------------------------------------------------------
-- topics: ölçme konuları (B1/B2, kind = measure) ve müfredat alanları
-- ---------------------------------------------------------------------------
alter table public.topics drop constraint if exists topics_level_check;
alter table public.topics add constraint topics_level_check check (level in ('A1', 'A2', 'B1', 'B2'));
alter table public.topics drop constraint if exists topics_kind_check;
alter table public.topics add constraint topics_kind_check check (kind in ('grammar', 'pron', 'measure'));

alter table public.topics
  add column irt_b real,
  add column unit smallint not null default 0 check (unit >= 0),
  add column value smallint not null default 2 check (value between 1 and 3),
  add column exam_weight smallint not null default 1 check (exam_weight between 0 and 2),
  add column confusables text[] not null default '{}',
  add column goal_tags text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- items: yeni slot amaçları ve yerleştirme bankası maddesi
-- ---------------------------------------------------------------------------
alter table public.items drop constraint if exists items_purpose_check;
alter table public.items add constraint items_purpose_check
  check (purpose in ('placement', 'review', 'focus', 'retest', 'stretch', 'probe', 'input', 'output', 'fluency'));
alter table public.items add column bank_item_id text;

-- ---------------------------------------------------------------------------
-- attempts: modelin tahmini (kalibrasyon ve AUC için), kanıt ağırlığı, yan kanıt
-- ---------------------------------------------------------------------------
alter table public.attempts
  add column pred_p real check (pred_p between 0 and 1),
  add column evidence_weight real check (evidence_weight between 0 and 1),
  add column incidental jsonb;

-- ---------------------------------------------------------------------------
-- programs, program_weeks: okul programı haritası (pedagoji sahibi doldurur)
-- ---------------------------------------------------------------------------
create table public.programs (
  id text primary key check (id ~ '^[a-z0-9_.-]+$'),
  name text not null,
  school text,
  active bool not null default true,
  created_at timestamptz not null default now()
);

alter table public.programs enable row level security;

create table public.program_weeks (
  program_id text not null references public.programs (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  topic_id text not null references public.topics (id),
  primary key (program_id, week_start)
);

alter table public.program_weeks enable row level security;

create policy programs_select on public.programs
  for select to authenticated using (true);
create policy programs_admin_all on public.programs
  for all to authenticated
  using ((select private.user_role()) = 'admin')
  with check ((select private.user_role()) = 'admin');
create policy program_weeks_select on public.program_weeks
  for select to authenticated using (true);
create policy program_weeks_admin_all on public.program_weeks
  for all to authenticated
  using ((select private.user_role()) = 'admin')
  with check ((select private.user_role()) = 'admin');

-- ---------------------------------------------------------------------------
-- profiles: kapsam durumu, bekleme listesi, çalışma modu, hedef, okul programı, odak seçimi
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column scope_status text not null default 'in_scope'
    check (scope_status in ('in_scope', 'above_scope', 'graduated')),
  add column notify_opt_in_at timestamptz,
  add column study_mode text check (study_mode in ('school', 'self')),
  add column goal text check (goal in ('communication', 'exam', 'work_travel')),
  add column program_id text references public.programs (id),
  add column focus_choice text references public.topics (id),
  add column placement_result jsonb,
  add column placement_done_at timestamptz;

-- ---------------------------------------------------------------------------
-- school_topics: kaynağı (program haritası ya da öğrenci)
-- ---------------------------------------------------------------------------
alter table public.school_topics
  add column source text not null default 'student' check (source in ('program', 'student'));

-- ---------------------------------------------------------------------------
-- learner_state: öğrenme profilinin önbelleği (attempts'ten yeniden kurulabilir)
-- ---------------------------------------------------------------------------
create table public.learner_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  version int not null,
  state jsonb not null,
  n_obs int not null default 0 check (n_obs >= 0),
  updated_at timestamptz not null default now()
);

alter table public.learner_state enable row level security;

create policy learner_state_select_own on public.learner_state
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy learner_state_select_teacher on public.learner_state
  for select to authenticated
  using ((select private.user_role()) = 'teacher');
create policy learner_state_admin_all on public.learner_state
  for all to authenticated
  using ((select private.user_role()) = 'admin')
  with check ((select private.user_role()) = 'admin');

-- ---------------------------------------------------------------------------
-- item_calibration: yerleştirme maddelerinin veriden güncellenen parametreleri (yalnızca admin)
-- ---------------------------------------------------------------------------
create table public.item_calibration (
  item_id text primary key,
  a real not null check (a > 0),
  b real not null,
  n int not null default 0 check (n >= 0),
  updated_at timestamptz not null default now()
);

alter table public.item_calibration enable row level security;

create policy item_calibration_admin_select on public.item_calibration
  for select to authenticated
  using ((select private.user_role()) = 'admin');

-- ---------------------------------------------------------------------------
-- app_settings: v2 ayarları (koda sabit yazılmaz)
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value) values
  ('placement_model', '{"stop_p": 0.95, "min_items": 8, "max_items": 25, "gate_p": 0.9, "extension_low": 0.6, "extension_items": 5}'),
  ('learner_model', '{"version": 1}'),
  ('curriculum', '{"coverage_a1": 0.98, "coverage_a2": 0.95}'),
  ('grade_samples', '3'),
  ('continuous_gate_p', '0.95'),
  ('retest_after_days', '7')
on conflict (key) do nothing;
