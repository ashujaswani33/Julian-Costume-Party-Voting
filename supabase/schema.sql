-- Run this entire file in Supabase: SQL Editor -> New query -> Run.
-- It creates the private database tables and private photo bucket for the app.

create extension if not exists pgcrypto;

create table if not exists public.party_settings (
  id smallint primary key default 1 check (id = 1),
  party_name text not null default 'Costume Party',
  registration_open boolean not null default true,
  voting_open boolean not null default false,
  results_visible boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.party_settings
  add column if not exists results_visible boolean not null default false;

insert into public.party_settings (id, party_name, registration_open, voting_open, results_visible)
values (1, 'Costume Party', true, false, false)
on conflict (id) do nothing;

create table if not exists public.contestants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 50),
  photo_path text not null unique,
  voter_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create unique index if not exists contestants_name_lower_unique
  on public.contestants (lower(trim(name)));

create table if not exists public.votes (
  id bigint generated always as identity primary key,
  voter_id uuid not null references public.contestants(id) on delete cascade,
  candidate_id uuid not null references public.contestants(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint one_vote_per_guest unique (voter_id),
  constraint cannot_vote_for_self check (voter_id <> candidate_id)
);

alter table public.party_settings enable row level security;
alter table public.contestants enable row level security;
alter table public.votes enable row level security;

-- No public RLS policies are intentionally created.
-- The website's server-side API uses the Supabase service-role key.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'costume-photos',
  'costume-photos',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
