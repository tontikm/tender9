-- Tender9 — Phase 1 schema
-- Run this once in Supabase: Project -> SQL Editor -> New query -> paste -> Run

-- Raw normalized tender records, one row per contracting process
create table if not exists tenders (
  id uuid primary key default gen_random_uuid(),
  source text not null,               -- 'etenders_ocds' | 'sita' | 'tshwane' | etc.
  external_id text not null,          -- OCID for Treasury records, source-specific ID otherwise
  title text not null,
  description text,
  buyer_name text,
  category text,
  province text,
  value_estimate numeric,
  currency text default 'ZAR',
  status text,
  closing_date timestamptz,
  briefing_date timestamptz,
  published_date timestamptz,
  document_urls text[],
  raw_payload jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (source, external_id)
);

create index if not exists idx_tenders_closing_date on tenders (closing_date);
create index if not exists idx_tenders_category on tenders (category);
create index if not exists idx_tenders_status on tenders (status);

-- Business profiles used to define what counts as "relevant".
-- Each belongs to one signed-up account (user_id) — this is the
-- multi-tenancy boundary: every query scopes matching_profiles (and,
-- through it, tender_matches) to the authenticated user.
create table if not exists matching_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  keywords text[],
  categories text[],
  provinces text[],
  min_value numeric,
  max_value numeric,
  cidb_grade text,
  active boolean default true,
  created_at timestamptz default now(),
  unique (user_id, name)
);

create index if not exists idx_matching_profiles_user_id on matching_profiles (user_id);

-- Matches: which tenders matched which profile
create table if not exists tender_matches (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid references tenders(id) on delete cascade,
  profile_id uuid references matching_profiles(id) on delete cascade,
  match_score numeric,
  status text default 'new',          -- 'new' | 'saved' | 'dismissed' | 'applied'
  notified_at timestamptz,
  created_at timestamptz default now(),
  unique (tender_id, profile_id)
);

-- Drafted response narratives (Claude-generated cover letter / EOI text).
-- One draft per tender — regenerating overwrites the previous draft.
create table if not exists tender_drafts (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid references tenders(id) on delete cascade unique,
  content text not null,
  model text,
  created_at timestamptz default now()
);

-- Ingestion run log
create table if not exists ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  started_at timestamptz default now(),
  finished_at timestamptz,
  records_fetched int,
  records_new int,
  records_updated int,
  status text,                        -- 'running' | 'success' | 'partial' | 'failed'
  error_message text
);

-- Enable RLS on everything. All access goes through server-side code
-- using the service role key (which bypasses RLS by design), so no
-- public policies are created here — per-user scoping (matching_profiles
-- .user_id) is enforced in the application layer, not by RLS. Do not add
-- public policies to these tables.
alter table tenders enable row level security;
alter table matching_profiles enable row level security;
alter table tender_matches enable row level security;
alter table tender_drafts enable row level security;
alter table ingestion_runs enable row level security;
