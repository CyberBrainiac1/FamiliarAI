-- Hackathon-only schema for same-person recognition MVP.
-- This intentionally keeps auth and access rules simple for quick testing.

create table if not exists public.people (
    id bigserial primary key,
    created_at timestamptz not null default now(),
    display_name text null,
    primary_embedding jsonb not null,
    preview_image_base64 text null
);

alter table public.recognition_events
    add column if not exists person_id bigint null references public.people(id) on delete set null,
    add column if not exists match_score double precision null;

create index if not exists idx_recognition_events_person_id
    on public.recognition_events(person_id);

alter table public.people enable row level security;
alter table public.recognition_events enable row level security;

-- Hackathon-only RLS: public key clients can read/write directly.
drop policy if exists hackathon_select_people on public.people;
create policy hackathon_select_people
on public.people
for select
to anon, authenticated
using (true);

drop policy if exists hackathon_insert_people on public.people;
create policy hackathon_insert_people
on public.people
for insert
to anon, authenticated
with check (true);

drop policy if exists hackathon_update_people on public.people;
create policy hackathon_update_people
on public.people
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists hackathon_select_events on public.recognition_events;
create policy hackathon_select_events
on public.recognition_events
for select
to anon, authenticated
using (true);

drop policy if exists hackathon_insert_events on public.recognition_events;
create policy hackathon_insert_events
on public.recognition_events
for insert
to anon, authenticated
with check (true);
