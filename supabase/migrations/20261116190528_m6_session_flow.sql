-- M6: oturum akışı (docs/SPEC.md Bölüm 3 `sessions`, rev. 3; docs/PLAN.md karar 17).
-- `generating` durumu: oturum satırı üretim başlamadan açılır, böylece aynı öğrenci için
-- iki üretim aynı anda başlamaz ve "Başla" ekranı hazırlanan oturumu yoklayabilir.

alter table public.sessions drop constraint sessions_status_check;
alter table public.sessions add constraint sessions_status_check
  check (status in ('generating', 'ready', 'active', 'done', 'abandoned', 'failed'));

-- Öğrenci başına en çok bir `generating` ya da `ready` oturum.
create unique index sessions_one_pending_per_user_idx
  on public.sessions (user_id)
  where status in ('generating', 'ready');
