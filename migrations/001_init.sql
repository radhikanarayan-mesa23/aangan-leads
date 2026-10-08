-- Aangan Leads :: initial schema
-- Plain Postgres. Runs on Neon or Supabase unchanged.
-- ASSUME: DATABASE_URL points at a Postgres 15+ database.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- users
create table if not exists users (
  email            text primary key,
  name             text not null,
  role             text not null check (role in ('owner','designer')),
  telegram_chat_id text,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------- leads
create sequence if not exists ticket_seq start 1;

create table if not exists leads (
  id                  uuid primary key default gen_random_uuid(),
  ticket_no           text unique not null default ('AAN-' || lpad(nextval('ticket_seq')::text, 4, '0')),
  vani_call_id        text unique not null,
  raw_payload         jsonb,
  created_at          timestamptz not null default now(),

  -- caller
  caller_name         text,
  caller_number       text,
  caller_email        text,

  -- call
  started_at          timestamptz,
  duration_s          integer,
  ended_reason        text,
  recording_path      text,
  recording_source_url text,
  transcript          jsonb not null default '[]'::jsonb,
  off_script_count    integer not null default 0,
  off_script_questions text[] not null default '{}',

  -- requirement
  fields              jsonb not null default '{}'::jsonb,

  -- grading
  grade               text check (grade in ('HOT','WARM','LOW','ESCALATE','NOT_ENQUIRY')),
  grade_reason        text,
  gemini_grade        text,
  criteria            jsonb not null default '{}'::jsonb,
  est_min_inr         bigint,
  est_max_inr         bigint,
  budget_fit          text check (budget_fit in ('fits','close','below','unknown')),
  confidence          numeric(3,2),
  price_mentioned     boolean not null default false,
  flags               text[] not null default '{}',

  -- ai notes
  summary             text,
  handoff_note        text,
  insights            jsonb not null default '{}'::jsonb,

  -- booking
  calcom_booking_id   text,
  booked_at           timestamptz,
  callback_due_at     timestamptz,
  callback_done_at    timestamptz,

  -- funnel
  stage               text not null default 'New',
  assigned_to         text references users(email) on delete set null,
  lost_reason         text,
  deal_value_inr      bigint,
  stage_changed_at    timestamptz not null default now(),
  first_contact_at    timestamptz,

  -- crm
  hubspot_contact_id  text,
  hubspot_deal_id     text,
  hubspot_sync_error  text,

  -- ops
  telegram_sent_at    timestamptz,
  telegram_queued_for timestamptz,
  step_errors         jsonb not null default '[]'::jsonb,
  vaani_cost_inr      numeric(10,2) not null default 0,
  llm_cost_inr        numeric(10,2) not null default 0,
  cost_inr            numeric(10,2) generated always as (vaani_cost_inr + llm_cost_inr) stored
);

-- Hard rule 4: no double booking.
create unique index if not exists leads_booked_at_uniq on leads (booked_at) where booked_at is not null;

create index if not exists leads_stage_idx       on leads (stage);
create index if not exists leads_grade_idx       on leads (grade);
create index if not exists leads_created_idx     on leads (created_at desc);
create index if not exists leads_assigned_idx    on leads (assigned_to);
create index if not exists leads_number_idx      on leads (caller_number);
create index if not exists leads_callback_idx    on leads (callback_due_at) where callback_done_at is null;

-- ---------------------------------------------------------- lead_events
create table if not exists lead_events (
  id         bigserial primary key,
  lead_id    uuid not null references leads(id) on delete cascade,
  at         timestamptz not null default now(),
  by         text,
  type       text not null check (type in ('created','graded','booked','stage_change','note','telegram','hubspot_sync','callback','error')),
  from_stage text,
  to_stage   text,
  note       text
);
create index if not exists lead_events_lead_idx on lead_events (lead_id, at desc);

-- ------------------------------------------------------------- sessions
create table if not exists magic_tokens (
  token      text primary key,
  email      text not null,
  expires_at timestamptz not null,
  used_at    timestamptz
);
