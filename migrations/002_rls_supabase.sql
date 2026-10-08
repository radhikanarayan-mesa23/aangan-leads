-- OPTIONAL: only run this if the database is Supabase and app users authenticate
-- through Supabase Auth. On Neon the app enforces the same separation in
-- middleware + server-side queries (see lib/auth.ts, middleware.ts).
--
-- Hard rule 5: designers cannot read owner-only surfaces.

alter table leads       enable row level security;
alter table lead_events enable row level security;
alter table users       enable row level security;

create or replace function current_role_of() returns text language sql stable as $$
  select role from users where email = auth.jwt() ->> 'email'
$$;

drop policy if exists leads_read on leads;
create policy leads_read on leads for select
  using (current_role_of() in ('owner','designer'));

drop policy if exists leads_write on leads;
create policy leads_write on leads for update
  using (current_role_of() in ('owner','designer'));

drop policy if exists events_read on lead_events;
create policy events_read on lead_events for select
  using (current_role_of() in ('owner','designer'));

drop policy if exists events_write on lead_events;
create policy events_write on lead_events for insert
  with check (current_role_of() in ('owner','designer'));

drop policy if exists users_read on users;
create policy users_read on users for select
  using (current_role_of() = 'owner' or email = auth.jwt() ->> 'email');
