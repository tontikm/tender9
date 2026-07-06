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

-- Business profiles used to define what counts as "relevant"
create table if not exists matching_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  keywords text[],
  categories text[],
  provinces text[],
  min_value numeric,
  max_value numeric,
  cidb_grade text,
  active boolean default true,
  created_at timestamptz default now()
);

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

-- Enable RLS on everything. This is internal tooling (only you use it),
-- so no public read/write policies are created here on purpose —
-- all access goes through API routes using the service role key,
-- which bypasses RLS by design. Do not add public policies to these tables.
alter table tenders enable row level security;
alter table matching_profiles enable row level security;
alter table tender_matches enable row level security;
alter table ingestion_runs enable row level security;

-- Seed one starter matching profile — edit keywords to taste after reviewing real data
insert into matching_profiles (name, keywords, categories, provinces)
values (
  'Tonti Trading - IT Hardware',
  array['ICT', 'IT infrastructure', 'hardware', 'computer equipment', 'networking', 'servers', 'software licence', 'printers', 'UPS'],
  array[]::text[],
  array['Gauteng']
)
on conflict do nothing;
