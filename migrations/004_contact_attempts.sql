-- A designer calling a lead had nowhere to record the outcome: the only way to
-- register activity was dragging a card. That made "callbacks on time" measure
-- the UI's shortcomings rather than the team's.
--
-- Idempotent and safe on a fresh database.

do $$
begin
  if not exists (select 1 from information_schema.columns where table_name='leads' and column_name='call_attempts') then
    alter table leads add column call_attempts integer not null default 0;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='leads' and column_name='last_attempt_at') then
    alter table leads add column last_attempt_at timestamptz;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='leads' and column_name='last_outcome') then
    alter table leads add column last_outcome text
      check (last_outcome in ('spoke','no_answer','call_later','wrong_number'));
  end if;
end $$;

create index if not exists leads_attempts_idx on leads (last_attempt_at) where last_attempt_at is not null;
