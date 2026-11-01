-- Выполнить один раз в Supabase: SQL Editor -> New query -> Run.
create table if not exists public.members (
  email text primary key,
  role  text not null check (role in ('owner','guest'))
);
create table if not exists public.docs (
  collection text not null,
  id         text not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);

alter table public.members enable row level security;
alter table public.docs    enable row level security;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where email = lower(auth.jwt() ->> 'email'));
$$;

drop policy if exists "member reads own role" on public.members;
create policy "member reads own role" on public.members for select to authenticated
  using (email = lower(auth.jwt() ->> 'email'));

drop policy if exists "members read docs"   on public.docs;
drop policy if exists "members insert docs" on public.docs;
drop policy if exists "members update docs" on public.docs;
drop policy if exists "members delete docs" on public.docs;
create policy "members read docs"   on public.docs for select to authenticated using (public.is_member());
create policy "members insert docs" on public.docs for insert to authenticated with check (public.is_member());
create policy "members update docs" on public.docs for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "members delete docs" on public.docs for delete to authenticated using (public.is_member());

alter publication supabase_realtime add table public.docs;
