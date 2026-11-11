-- M1: cohorts, profiles, app_settings (docs/SPEC.md Bölüm 3).
-- RLS üç tabloda da açık, politika yok: yalnızca servis istemcisi erişir.
-- Politikalar M2'de ayrı bir göçle gelir.

create table public.cohorts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  capacity int not null default 60,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now()
);

alter table public.cohorts enable row level security;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role text not null default 'student'
    check (role in ('student', 'teacher', 'admin')),
  cohort_id uuid references public.cohorts (id),
  level_self text check (level_self in ('A1', 'A2', 'unsure')),
  level_est text check (level_est in ('A1', 'A2')),
  interests text[] not null default '{}',
  explain_mode text not null default 'short'
    check (explain_mode in ('short', 'long')),
  adult_confirmed_at timestamptz,
  consent_version text,
  consent_at timestamptz,
  onboarding_step text not null default 'invite'
    check (onboarding_step in ('invite', 'consent', 'profile', 'placement', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

-- Varsayılanlar göçte durur (seed'de değil): prod da bu değerlere ihtiyaç duyar.
insert into public.app_settings (key, value) values
  ('kill_switch', 'false'),
  ('monthly_budget_usd', '40'),
  ('daily_session_limit', '2'),
  ('model_generate', '"claude-haiku-5-5"'),
  ('model_grade', '"claude-haiku-5-5"'),
  ('effort_generate', '"medium"'),
  ('effort_grade', '"low"'),
  ('thinking_grade', '"adaptive"'),
  ('model_transcribe', '"MAI-Transcribe-2"'),
  ('tts_model', '"simba-3.5"'),
  ('tts_voice', 'null'),
  ('tts_enabled', 'true'),
  ('tts_plan_usd', '0'),
  ('tts_monthly_char_alert', '400000'),
  ('review_sample_rate', '0.15'),
  ('general_content_rate', '0.2');
