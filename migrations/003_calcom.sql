-- Calendly → Cal.com (docs/DECISIONS.md, 2026-10-09).
-- The database is already live on Neon, so this is a real migration rather than
-- an edit to 001. Idempotent: safe to re-run, and safe on a fresh database.

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name = 'leads' and column_name = 'calendly_event_uri') then
    alter table leads rename column calendly_event_uri to calcom_booking_uid;
  end if;

  if exists (select 1 from information_schema.columns
             where table_name = 'leads' and column_name = 'calendly_cancel_url') then
    alter table leads rename column calendly_cancel_url to calcom_cancel_url;
  end if;

  if not exists (select 1 from information_schema.columns
                 where table_name = 'leads' and column_name = 'calcom_booking_uid') then
    alter table leads add column calcom_booking_uid text;
  end if;

  if not exists (select 1 from information_schema.columns
                 where table_name = 'leads' and column_name = 'calcom_cancel_url') then
    alter table leads add column calcom_cancel_url text;
  end if;
end $$;

-- A booking made in Cal.com rather than by the agent is held as its own lead,
-- so looking it up by uid must be fast and unambiguous.
create unique index if not exists leads_calcom_uid_uniq
  on leads (calcom_booking_uid) where calcom_booking_uid is not null;
