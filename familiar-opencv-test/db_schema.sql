-- Hackathon-only schema for Familiar Cards MVP.
-- Uses capitalized table and columns:
-- public."Cards" ("Name", "Relation", "Image", "Last Met")

create table if not exists public."Cards" (
    id bigserial primary key,
    "Name" text null,
    "Relation" text null,
    "Image" text null,
    "Last Met" text null
);

alter table public."Cards" enable row level security;

drop policy if exists hackathon_select_cards on public."Cards";
create policy hackathon_select_cards
on public."Cards"
for select
to anon, authenticated
using (true);

drop policy if exists hackathon_insert_cards on public."Cards";
create policy hackathon_insert_cards
on public."Cards"
for insert
to anon, authenticated
with check (true);

drop policy if exists hackathon_update_cards on public."Cards";
create policy hackathon_update_cards
on public."Cards"
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists hackathon_delete_cards on public."Cards";
create policy hackathon_delete_cards
on public."Cards"
for delete
to anon, authenticated
using (true);
